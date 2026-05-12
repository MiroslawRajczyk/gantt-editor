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

# Type-check only (no emit)
docker run --rm -v /home/igor/gantt-editor2:/work node:20-alpine sh -c "cd /work && npx tsc --noEmit"
```

App served at **http://localhost:3000**.

## Architecture

React 18 + TypeScript + Vite frontend, static files via nginx, multi-stage Docker build.

**Split-panel layout** (`App.tsx`): left panel (task list) + right panel (Gantt chart) split by draggable `Divider`. Panel widths stored as percentage (15–70%).

**Core types** (`src/types.ts`): `GanttTask` has `id`, `name`, `start: Date`, `end: Date`, `progress: number` (in data model, not shown in chart), `dependencies?: string[]` (predecessor *local* ids), `clickupId?: string` (set when task linked to ClickUp), and ClickUp-synced optional fields: `status?: string`, `priority?: 1|2|3|4`, `assignees?: Assignee[]`, `description?: string`. `Assignee` is `{ id: number; username: string }` — stores ClickUp user ID (needed to push assignee changes via API). Migrated tasks from old `string[]` format get `id: -1` as sentinel; those are display-only and excluded from ClickUp pushes.

**State and persistence** (`hooks/useTasks.ts`): all tasks in single `useState` array, persisted to `localStorage` under key `'gantt-tasks'`. First load creates example task. `updateTask` uses functional `setState` form so sequential calls compose correctly (React 18 batches). `deserialize` runs a migration on load: if `assignees` entries are strings (old format), they're wrapped as `{ id: -1, username }` so existing data stays valid after the type change to `Assignee[]`.

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

**TaskRow** (`components/TaskRow.tsx`): inline name editing (click to edit, Enter/Blur to commit, Escape to cancel). Date inputs clamp other date to prevent start > end. Row height fixed to `GANTT_ROW_HEIGHT` for gantt alignment. `⤢` icon button (visible on hover) opens `TaskDetailPopup`.

**TaskDetailPopup** (`components/TaskDetailPopup.tsx`): centered modal opened from the `⤢` button on each task row. State in `App.tsx` (`detailTaskId`). Shows: task ID badge, status selector (editable when ClickUp configured), ↗ link to ClickUp if `clickupId` set, priority pill dropdown (1=Urgent/2=High/3=Normal/4=Low), editable name, assignee chips with `×` remove + `+ Add` button (when ClickUp configured), date pickers, dependency chips with `×` remove, description textarea. No progress bar. Receives `clickupToken`/`clickupTeamId`/`clickupListId` from `App.tsx` (via `useClickUpConfig`) to enable the assignee picker and status selector.

**StatusSelector** (inline component in `TaskDetailPopup.tsx`): colored badge in the topbar that opens a dropdown of list statuses when ClickUp token + listId are configured. Fetches available statuses via `getListStatuses` on first open and caches them for the popup's lifetime. Uses the status color from ClickUp for the badge background. Falls back to a read-only badge when ClickUp is not configured or the task has no status.

**AssigneePicker** (`components/AssigneePicker.tsx`): floating dropdown rendered inside the assignees row of `TaskDetailPopup`. Fetches workspace members via `listTeamMembers` on first open (cached in component state for the popup's lifetime). Fuzzy-filters by username+email substring. Shows checkmark for already-assigned members; clicking toggles. Closes on Escape or outside click. Displays API errors inline (red text) if the member fetch fails.

**CSS** (`src/App.css`): CSS custom properties defined in `:root` at top of file — `--accent`, `--border`, `--surface-*`, `--text-*`, `--radius-*`, `--shadow-*`. All popup styles use these vars. Existing non-popup styles use hardcoded colors for historical reasons.

## ClickUp two-way sync

App talks to ClickUp REST API directly from browser. No backend — all sync logic client-side.

**Network path**: nginx proxies `/clickup/*` → `https://api.clickup.com/api/v2/*` (`nginx.conf` `location /clickup/` block). `resolver` directive required for nginx-alpine to resolve `api.clickup.com` at runtime; `proxy_ssl_server_name on` required for SNI. `vite.config.ts` mirrors proxy under `server.proxy` for parity in `vite dev`. Personal API tokens (`pk_*`) sent in `Authorization` header verbatim, no `Bearer ` prefix (OAuth would need it; not used).

**Config** (`hooks/useClickUpConfig.ts`): `ClickUpConfig` (`token`, `teamId`, `spaceId`, `folder`, `listId`, optional `lastSyncAt`) persisted to `localStorage['clickup-config']`. `folder` is real folder id or literal `'folderless'` for spaces with lists directly under space. Token in localStorage — acceptable for personal tool but readable by XSS (noted in `ClickUpSettings.tsx`).

**Settings UI** (`components/ClickUpSettings.tsx`): cascading dropdowns Workspace → Space → Folder → List. Token entry has explicit "Load" button to avoid firing requests on every keystroke. Mounted from "ClickUp" button in `App.tsx` header.

**API client** (`src/lib/clickup.ts`): pure functions over `fetch('/clickup/...')`. Tokens passed as first arg; nothing module-scoped. Throws `ClickUpError` (status + body) on non-2xx so callers get ClickUp's `{err, ECODE}` payload. `toClickUpDate`/`fromClickUpDate` translate between JS `Date` and ClickUp's "ms since epoch as STRING". `getAllTasks` paginates until page returns < 100 tasks. Create/update bodies set `start_date_time: false`/`due_date_time: false` for date-only model. `CreateTaskBody` and `UpdateTaskBody` are separate types because the assignees field format differs: create takes `assignees: number[]` (user IDs), update takes `assignees: { add?: number[]; rem?: number[] }`. `UpdateTaskBody` also accepts `status?: string`. `listTeamMembers` fetches via `GET /team` (not `/team/{id}/member` — that endpoint doesn't exist) and extracts the matching team's members array. `getListStatuses(token, listId)` fetches `GET /list/{listId}` and returns the `.statuses` array (`ClickUpStatus[]`: `{ status, color, orderindex }`).

**Sync engine** (`src/lib/sync.ts`, `syncWithClickUp`): six phases on manual "Sync now". (1) Fetch all remote tasks — fatal on failure. (2) Each linked local task with remote match: compare `r.date_updated` to `config.lastSyncAt` — remote changed since last sync → ClickUp wins, overwrite local `name`/`start`/`end`/`status`/`priority`/`assignees`/`description`; else push local up via PUT (pushes `name`, `start`/`end`, `priority`, `description`, `status`, and assignee add/rem diff — IDs with sentinel `-1` are excluded from push). Important: in the push branch, `next.push` spreads `...l` and does NOT overwrite `assignees` with the stale pre-push remote data (avoids a reversion bug). Linked locals whose remote vanished are dropped. (3) Create remote tasks for local-only rows (no `clickupId`), capture returned id, include `priority`/`description`/`assignees` in create body. (4) Synthesize local rows for remote-only tasks (fresh UUID, sets `clickupId`, copies all synced fields). (5) Dependencies additive union: local-not-remote edges POSTed up, remote-not-local added locally; final deps = union. (6) Bulk `setTasks(next)` — single render. Caller (`App.tsx` `onSync`) updates `lastSyncAt`.

**Conflict policy**: ClickUp wins only when its `date_updated` postdates last sync; otherwise local propagates up. Effectively two-way for common case where only one side edited between syncs.

**Synced fields**: `name`, `start`/`end` dates, `dependencies`, `priority` (push+pull; ClickUp int 1–4), `description` (push+pull), `assignees` (push+pull; push sends `{ add: [...ids], rem: [...ids] }` diff; IDs come from `Assignee.id`), `status` (push+pull; push sends the status name string; ClickUp validates it against the list's configured statuses — the `StatusSelector` dropdown is pre-populated from `getListStatuses` so only valid values appear).

**v1 limitations**: no baseline tracking → dependency *removals* don't propagate either direction (remove on both sides manually); local delete does not delete remote (`deleteTask` intentionally unexposed); no rate-limit backoff (ClickUp free tier ~100 req/min — surface 429s, retry manually); no realtime/webhook/auto-poll. Subtasks, comments, attachments, time tracking, tags, `progress` not synced.

**Hook contract** (`hooks/useTasks.ts`): raw `useState` setter exposed as `setTasks` so `syncWithClickUp` does single bulk replacement. Persistence `useEffect` watches `tasks`, writes `localStorage['gantt-tasks']`; bulk replacement round-trips through JSON serialize/deserialize cleanly (dates → ISO → Date).
