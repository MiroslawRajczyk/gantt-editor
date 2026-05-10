# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key constraint: no npm on the host

There is no Node.js/npm on the host machine. All build and install commands must run inside Docker:

```bash
# Build and start (primary workflow)
docker compose up --build -d

# Run arbitrary npm/node commands
docker run --rm -v /home/igor/gantt-editor2:/work node:20-alpine sh -c "cd /work && <command>"

# Example: add a package
docker run --rm -v /home/igor/gantt-editor2:/work node:20-alpine sh -c "cd /work && npm install <pkg>"
```

The app is served at **http://localhost:3000**.

## Architecture

React 18 + TypeScript + Vite frontend, served as static files via nginx in a multi-stage Docker build.

**Split-panel layout** (`App.tsx`): left panel (task list) and right panel (Gantt chart) separated by a draggable `Divider`. Panel widths are stored as a percentage (15–70%).

**Core type** (`src/types.ts`): `GanttTask` has `id`, `name`, `start: Date`, `end: Date`, `progress: number` (kept in the data model but not displayed in the chart), `dependencies?: string[]` (predecessor *local* ids), and `clickupId?: string` (set once a task is linked to a ClickUp task — see ClickUp sync section).

**State and persistence** (`hooks/useTasks.ts`): all tasks live in a single `useState` array persisted to `localStorage` under the key `'gantt-tasks'`. On first load an example task is created. `updateTask` uses the functional `setState` form so multiple sequential calls compose correctly (React 18 batches them).

**Gantt library** (`src/lib/frappe-gantt/`): frappe-gantt is vendored locally (not from npm) so it can be freely modified. The Vite alias `frappe-gantt` → `src/lib/frappe-gantt/index.js` makes existing imports work unchanged. `@types/frappe-gantt` remains in devDependencies for TypeScript types.

Key bugs fixed in the local fork:
- `get_all_dependent_tasks()` BFS — original prematurely added nodes to `out` before computing `to_process`, limiting traversal to one level. Fixed to use a `Set`-based BFS.
- `bind_bar_events` — dependent tasks were included in the drag group even during resize operations. Fixed to only include dependents when `is_dragging` is true.

**Alignment constants** (`src/constants.ts`): frappe-gantt row and header geometry is hardcoded in the library. `GANTT_ROW_HEIGHT` (48px) and `GANTT_HEADER_HEIGHT` (85px) must stay in sync with frappe-gantt defaults. The LHS `TaskPanel` header height is set to `GANTT_HEADER_HEIGHT + GANTT_TOOLBAR_HEIGHT` to account for the toolbar above the gantt chart.

**Scroll sync** (`App.tsx` `handleContainerReady`): bidirectional scroll sync between the `.gantt-container` div (RHS) and the task list div (LHS) using event listeners guarded by `isSyncingRef` to prevent feedback loops.

**Dependency propagation** (`src/utils.ts`, `GanttPanel.tsx`, `App.tsx`):
- `getAllSuccessors(taskId, tasks)` — shared BFS returning all transitive successors.
- `GanttPanel` `on_date_change`: distinguishes drag from resize using a ±2s heuristic on `durationDelta` (frappe-gantt applies a −1s adjustment to end dates). Drag (start shifts, duration unchanged within 2s) propagates `startDelta`; right-edge resize (start unchanged, duration changes) propagates `durationDelta`; left-edge resize propagates nothing.
- `App.handleTaskUpdate`: when the LHS end date changes, propagates the end delta to all transitive successors. Passed as `onUpdate` to `TaskPanel`.

**Connect mode** (`GanttPanel.tsx`): click-to-connect pattern for creating/removing dependency arrows. Uses `ganttClickRef` reassigned every render so frappe-gantt's captured `on_click` callback always has fresh closure values. `connectModeRef` and `connectSourceRef` are refs (not state) for use inside frappe-gantt callbacks; `connectMode` and `connectSource` are state for React re-renders. Escape key cancels connect mode.

**Refresh without scroll reset** (`GanttPanel.tsx`): every `gantt.refresh()` call saves and restores `.gantt-container` scroll position to prevent the gantt from jumping on React-triggered re-renders.

**TaskRow** (`components/TaskRow.tsx`): inline name editing (click to edit, Enter/Blur to commit, Escape to cancel). Date inputs clamp the other date to prevent start > end. Row height is fixed to `GANTT_ROW_HEIGHT` to stay aligned with gantt rows.

## ClickUp two-way sync

The app talks to the ClickUp REST API directly from the browser. There is no app backend — all sync logic runs client-side.

**Network path**: nginx serves `/clickup/*` as a reverse proxy to `https://api.clickup.com/api/v2/*` (`nginx.conf` `location /clickup/` block). The `resolver` directive is required for nginx-alpine to resolve `api.clickup.com` at runtime; `proxy_ssl_server_name on` is required for SNI. `vite.config.ts` mirrors the proxy under `server.proxy` for parity in `vite dev`. Personal API tokens (`pk_*`) are sent in the `Authorization` header verbatim, with no `Bearer ` prefix (OAuth tokens would need it; we don't use OAuth).

**Config** (`hooks/useClickUpConfig.ts`): `ClickUpConfig` (`token`, `teamId`, `spaceId`, `folder`, `listId`, optional `lastSyncAt`) is persisted to `localStorage['clickup-config']`. `folder` is either a real folder id or the literal string `'folderless'` for spaces whose lists live directly under the space. The token sits in localStorage — acceptable for a personal tool but readable by any XSS in this origin (called out in `ClickUpSettings.tsx`).

**Settings UI** (`components/ClickUpSettings.tsx`): cascading dropdowns Workspace → Space → Folder → List. Token entry has an explicit "Load" button so we don't fire requests on every keystroke. Mounted from a "ClickUp" button added to `App.tsx`'s header.

**API client** (`src/lib/clickup.ts`): pure functions over `fetch('/clickup/...')`. Tokens are passed in as the first argument; nothing is module-scoped. Throws `ClickUpError` (with status + body) on non-2xx so callers get ClickUp's `{err, ECODE}` payload. Date helpers `toClickUpDate`/`fromClickUpDate` translate between JS `Date` and ClickUp's "ms since epoch as STRING" convention. `getAllTasks` paginates until a page returns < 100 tasks. Create/update bodies set `start_date_time: false`/`due_date_time: false` so ClickUp treats values as date-only, matching this app's date-only model.

**Sync engine** (`src/lib/sync.ts`, `syncWithClickUp`): runs in six phases on the manual "Sync now" button. (1) Fetch all remote tasks — fatal if this fails. (2) For each linked local task with a remote match, decide direction by comparing `r.date_updated` to `config.lastSyncAt`: if remote changed since last sync → ClickUp wins, overwrite local `name`/`start`/`end`; otherwise push local fields up via PUT. Linked locals whose remote disappeared are dropped. (3) Create remote tasks for locally-only rows (no `clickupId`), capture the returned id back onto the local row. (4) Synthesize new local rows for remote-only tasks (assigns a fresh local UUID, sets `clickupId`). (5) Dependencies are an additive union: edges in local-but-not-remote are POSTed up, edges in remote-but-not-local are added locally; final per-task deps = union. (6) Bulk `setTasks(next)` — single render, not N. Caller (`App.tsx` `onSync`) updates `lastSyncAt`.

**Conflict policy**: ClickUp wins for fields *only when its `date_updated` postdates the last sync*; otherwise local edits propagate up. This makes the chosen "ClickUp wins" policy actually two-way for the common case where only one side edited a given task between syncs.

**v1 limitations** (called out in plan / sync.ts): no baseline tracking, so dependency *removals* don't propagate either direction (user must remove on both sides); local task deletion does not delete remote (`deleteTask` is intentionally not exposed); no rate-limit backoff (ClickUp's free tier is ~100 req/min — surface 429s in the report and retry manually); no realtime/webhook, no auto-poll. Subtasks/parent hierarchy, custom fields, statuses, assignees, time tracking, tags, and `progress` are not synced.

**Hook contract** (`hooks/useTasks.ts`): the underlying `useState` setter is exposed as `setTasks` specifically so `syncWithClickUp` can do a single bulk replacement. The persistence `useEffect` watches `tasks` and writes `localStorage['gantt-tasks']`, so bulk replacement round-trips through JSON serialize/deserialize cleanly (dates → ISO → Date).
