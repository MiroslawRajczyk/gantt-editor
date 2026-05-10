The file doesn't exist at that path — this is an inline task. I'll output the fixed compressed file directly with all four corrections applied.

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key constraint: no npm on the host

No Node.js/npm on host. All build/install commands run inside Docker:

```bash
# Build and start (primary workflow)
docker compose up --build -d

# Run arbitrary npm/node commands
docker run --rm -v /home/igor/gantt-editor2:/work node:20-alpine sh -c "cd /work && <command>"

# Example: add a package
docker run --rm -v /home/igor/gantt-editor2:/work node:20-alpine sh -c "cd /work && npm install <pkg>"
```

App served at **http://localhost:3000**.

## Architecture

React 18 + TypeScript + Vite frontend, static files via nginx, multi-stage Docker build.

**Split-panel layout** (`App.tsx`): left panel (task list) + right panel (Gantt chart) split by draggable `Divider`. Panel widths stored as percentage (15–70%).

**Core type** (`src/types.ts`): `GanttTask` has `id`, `name`, `start: Date`, `end: Date`, `progress: number` (in data model, not shown in chart), `dependencies?: string[]` (predecessor *local* ids), `clickupId?: string` (set when task linked to ClickUp).

**State and persistence** (`hooks/useTasks.ts`): all tasks in single `useState` array, persisted to `localStorage` under key `'gantt-tasks'`. First load creates example task. `updateTask` uses functional `setState` form so sequential calls compose correctly (React 18 batches).

**Gantt library** (`src/lib/frappe-gantt/`): frappe-gantt vendored locally (not npm) for free modification. Vite alias `frappe-gantt` → `src/lib/frappe-gantt/index.js` keeps imports unchanged. `@types/frappe-gantt` stays in devDependencies for types.

Local fork bugs fixed:
- `get_all_dependent_tasks()` BFS — original prematurely added nodes to `out` before computing `to_process`, limiting traversal to one level. Fixed with `Set`-based BFS.
- `bind_bar_events` — dependents included in drag group during resize. Fixed: only include dependents when `is_dragging` true.

**Alignment constants** (`src/constants.ts`): frappe-gantt row/header geometry hardcoded in library. `GANTT_ROW_HEIGHT` (48px) and `GANTT_HEADER_HEIGHT` (85px) must stay in sync with frappe-gantt defaults. LHS `TaskPanel` header height = `GANTT_HEADER_HEIGHT + GANTT_TOOLBAR_HEIGHT` to account for toolbar above gantt.

**Scroll sync** (`App.tsx` `handleContainerReady`): bidirectional scroll sync between `.gantt-container` div (RHS) and task list div (LHS) via event listeners guarded by `isSyncingRef` to prevent feedback loops.

**Dependency propagation** (`src/utils.ts`, `GanttPanel.tsx`, `App.tsx`):
- `getAllSuccessors(taskId, tasks)` — shared BFS, returns all transitive successors.
- `GanttPanel` `on_date_change`: distinguishes drag vs resize via ±2s heuristic on `durationDelta` (frappe-gantt applies −1s adjustment to end dates). Drag → propagates `startDelta`; right-edge resize → propagates `durationDelta`; left-edge resize → propagates nothing.
- `App.handleTaskUpdate`: LHS end date change propagates end delta to all transitive successors. Passed as `onUpdate` to `TaskPanel`.

**Connect mode** (`GanttPanel.tsx`): click-to-connect for creating/removing dependency arrows. Uses `ganttClickRef` reassigned every render so frappe-gantt's `on_click` always has fresh closure. `connectModeRef`/`connectSourceRef` are refs (not state) for frappe-gantt callbacks; `connectMode`/`connectSource` are state for React re-renders. Escape cancels connect mode.

**Refresh without scroll reset** (`GanttPanel.tsx`): every `gantt.refresh()` saves and restores `.gantt-container` scroll position to prevent jumping on React re-renders.

**TaskRow** (`components/TaskRow.tsx`): inline name editing (click to edit, Enter/Blur to commit, Escape to cancel). Date inputs clamp other date to prevent start > end. Row height fixed to `GANTT_ROW_HEIGHT` for gantt alignment.

## ClickUp two-way sync

App talks to ClickUp REST API directly from browser. No backend — all sync logic client-side.

**Network path**: nginx proxies `/clickup/*` → `https://api.clickup.com/api/v2/*` (`nginx.conf` `location /clickup/` block). `resolver` directive required for nginx-alpine to resolve `api.clickup.com` at runtime; `proxy_ssl_server_name on` required for SNI. `vite.config.ts` mirrors proxy under `server.proxy` for parity in `vite dev`. Personal API tokens (`pk_*`) sent in `Authorization` header verbatim, no `Bearer ` prefix (OAuth would need it; not used).

**Config** (`hooks/useClickUpConfig.ts`): `ClickUpConfig` (`token`, `teamId`, `spaceId`, `folder`, `listId`, optional `lastSyncAt`) persisted to `localStorage['clickup-config']`. `folder` is real folder id or literal `'folderless'` for spaces with lists directly under space. Token in localStorage — acceptable for personal tool but readable by XSS (noted in `ClickUpSettings.tsx`).

**Settings UI** (`components/ClickUpSettings.tsx`): cascading dropdowns Workspace → Space → Folder → List. Token entry has explicit "Load" button to avoid firing requests on every keystroke. Mounted from "ClickUp" button in `App.tsx` header.

**API client** (`src/lib/clickup.ts`): pure functions over `fetch('/clickup/...')`. Tokens passed as first arg; nothing module-scoped. Throws `ClickUpError` (status + body) on non-2xx so callers get ClickUp's `{err, ECODE}` payload. `toClickUpDate`/`fromClickUpDate` translate between JS `Date` and ClickUp's "ms since epoch as STRING". `getAllTasks` paginates until page returns < 100 tasks. Create/update bodies set `start_date_time: false`/`due_date_time: false` for date-only model.

**Sync engine** (`src/lib/sync.ts`, `syncWithClickUp`): six phases on manual "Sync now". (1) Fetch all remote tasks — fatal on failure. (2) Each linked local task with remote match: compare `r.date_updated` to `config.lastSyncAt` — remote changed since last sync → ClickUp wins, overwrite local `name`/`start`/`end`; else push local up via PUT. Linked locals whose remote vanished are dropped. (3) Create remote tasks for local-only rows (no `clickupId`), capture returned id. (4) Synthesize local rows for remote-only tasks (fresh UUID, sets `clickupId`). (5) Dependencies additive union: local-not-remote edges POSTed up, remote-not-local added locally; final deps = union. (6) Bulk `setTasks(next)` — single render. Caller (`App.tsx` `onSync`) updates `lastSyncAt`.

**Conflict policy**: ClickUp wins only when its `date_updated` postdates last sync; otherwise local propagates up. Effectively two-way for common case where only one side edited between syncs.

**v1 limitations** (noted in plan / sync.ts): no baseline tracking → dependency *removals* don't propagate either direction (remove on both sides manually); local delete does not delete remote (`deleteTask` intentionally unexposed); no rate-limit backoff (ClickUp free tier ~100 req/min — surface 429s, retry manually); no realtime/webhook/auto-poll. Subtasks, hierarchy, custom fields, statuses, assignees, time tracking, tags, `progress` not synced.

**Hook contract** (`hooks/useTasks.ts`): raw `useState` setter exposed as `setTasks` so `syncWithClickUp` does single bulk replacement. Persistence `useEffect` watches `tasks`, writes `localStorage['gantt-tasks']`; bulk replacement round-trips through JSON serialize/deserialize cleanly (dates → ISO → Date).