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

**Core types** (`src/types.ts`): `GanttTask` has `id`, `name`, `start?: Date`, `end?: Date` (both optional — a task without dates is valid and shown only in the left panel), `progress: number` (in data model, not shown in chart), `dependencies?: string[]` (predecessor *local* ids), `clickupId?: string` (set when task linked to ClickUp), and ClickUp-synced optional fields: `status?: string`, `priority?: 1|2|3|4`, `assignees?: Assignee[]`, `tags?: Tag[]`, `description?: string`. `Assignee` is `{ id: number; username: string }` — stores ClickUp user ID (needed to push assignee changes via API). Migrated tasks from old `string[]` format get `id: -1` as sentinel; those are display-only and excluded from ClickUp pushes. `Tag` is `{ name: string; tag_bg?: string; tag_fg?: string }`.

**State and persistence** (`src/hooks/useTasks.ts`): all tasks in single `useState` array, persisted to `localStorage` under key `'gantt-tasks'`. First load creates example task. `updateTask` uses functional `setState` form so sequential calls compose correctly (React 18 batches). `deserialize` runs a migration on load: if `assignees` entries are strings (old format), they're wrapped as `{ id: -1, username }`; absent `start`/`end` fields deserialize to `undefined` (not Invalid Date).

**Gantt library** (`src/lib/frappe-gantt/`): frappe-gantt vendored locally (not npm) for free modification. Vite alias `frappe-gantt` → `src/lib/frappe-gantt/index.js` keeps imports unchanged. `@types/frappe-gantt` stays in devDependencies for types.

Local fork changes:
- `get_all_dependent_tasks()` BFS — original prematurely added nodes to `out` before computing `to_process`, limiting traversal to one level. Fixed with `Set`-based BFS.
- `bind_bar_events` — dependents included in drag group during resize. Fixed: only include dependents when `is_dragging` true.
- `_placeholder` task support (see Dateless tasks section below).

**Alignment constants** (`src/constants.ts`): frappe-gantt row/header geometry hardcoded in library. `GANTT_ROW_HEIGHT` (48px) and `GANTT_HEADER_HEIGHT` (85px) must stay in sync with frappe-gantt defaults. LHS `TaskPanel` header height = `GANTT_HEADER_HEIGHT + GANTT_TOOLBAR_HEIGHT` to account for toolbar above gantt.

**Scroll sync** (`App.tsx` `handleContainerReady`): bidirectional scroll sync between `.gantt-container` div (RHS) and task list div (LHS) via event listeners guarded by `isSyncingRef` to prevent feedback loops. Sync is pixel-based (`scrollTop`), so both panels must always have the same number of rows — enforced by placeholder rows (see below).

**Dependency propagation** (`src/utils.ts`, `GanttPanel.tsx`, `App.tsx`):
- `getAllSuccessors(taskId, tasks)` — shared BFS, returns all transitive successors.
- `GanttPanel` `on_date_change`: distinguishes drag vs resize via ±2s heuristic on `durationDelta` (frappe-gantt applies −1s adjustment to end dates). Drag → propagates `startDelta`; right-edge resize → propagates `durationDelta`; left-edge resize → propagates nothing. Guards skip successors with undefined dates.
- `App.handleTaskUpdate`: LHS end date change propagates end delta to all transitive successors. Guards skip tasks with undefined dates.

**Connect mode** (`GanttPanel.tsx`): click-to-connect for creating/removing dependency arrows. Uses `ganttClickRef` reassigned every render so frappe-gantt's `on_click` always has fresh closure. `connectModeRef`/`connectSourceRef` are refs (not state) for frappe-gantt callbacks; `connectMode`/`connectSource` are state for React re-renders. Escape cancels connect mode.

**Refresh without scroll reset** (`GanttPanel.tsx`): every `gantt.refresh()` saves and restores `.gantt-container` scroll position to prevent jumping on React re-renders.

**TaskRow** (`components/TaskRow.tsx`): inline name editing (click to edit, Enter/Blur to commit, Escape to cancel). Date inputs show empty when date is undefined; clearing the text field (blur on empty) sets the date to `undefined`. Clamping (start > end prevention) only runs when both dates are defined. Row height fixed to `GANTT_ROW_HEIGHT` for gantt alignment. `⤢` icon button (visible on hover) opens `TaskDetailPopup`.

**TaskDetailPopup** (`components/TaskDetailPopup.tsx`): centered modal opened from the `⤢` button on each task row. State in `App.tsx` (`detailTaskId`). Shows: task ID badge, status selector (editable when ClickUp configured), ↗ link to ClickUp if `clickupId` set, priority pill dropdown (1=Urgent/2=High/3=Normal/4=Low), editable name, assignee chips with `×` remove + `+ Add` button (when ClickUp configured), tag chips with `×` remove + `+ Add tag` button (when ClickUp space configured), date pickers (empty when undefined; clearing sets to undefined), dependency chips with `×` remove, description textarea. Days display only shown when both dates are defined.

**StatusSelector** (inline component in `TaskDetailPopup.tsx`): colored badge in the topbar that opens a dropdown of list statuses when ClickUp token + listId are configured. Fetches available statuses via `getListStatuses` on first open and caches them for the popup's lifetime.

**AssigneePicker** (`components/AssigneePicker.tsx`): floating dropdown rendered inside the assignees row of `TaskDetailPopup`. Fetches workspace members via `listTeamMembers` on first open (cached in component state for the popup's lifetime). Fuzzy-filters by username+email substring.

**TagPicker** (`components/TagPicker.tsx`): floating dropdown in `TaskDetailPopup`. Fetches space tags via `getSpaceTags` on first open. Shows existing tags with toggle checkmarks; supports creating new tags inline. Only visible when ClickUp token + spaceId are configured.

**CSS** (`src/App.css`): CSS custom properties defined in `:root` at top of file — `--accent`, `--border`, `--surface-*`, `--text-*`, `--radius-*`, `--shadow-*`. All popup styles use these vars. Existing non-popup styles use hardcoded colors for historical reasons.

## Dateless tasks

Tasks without `start`/`end` are valid and appear in the left panel like any other task, but are not rendered as bars in the Gantt chart. Dependency arrows involving a dateless task also do not appear.

**Scroll sync preservation**: frappe-gantt must always render exactly N rows (one per task, in order) for the pixel-based scroll sync to stay aligned. To achieve this, `GanttPanel` passes ALL tasks to frappe-gantt, marking dateless tasks with `_placeholder: true`. The vendored frappe-gantt handles `_placeholder` tasks as follows:
- `setup_tasks`: placeholder tasks skip date validation; `_start`/`_end` are set to `new Date()` (dummy, never used for display)
- `setup_gantt_dates`: placeholder tasks are skipped when computing the visible date range; if all tasks are placeholders, falls back to today
- `make_bars`: bar group for placeholder tasks gets `visibility:hidden; pointer-events:none`
- `make_arrows`: arrows are skipped when either endpoint task has `_placeholder: true`

## ClickUp two-way sync

App talks to ClickUp REST API directly from browser. No backend — all sync logic client-side.

**Network path**: nginx proxies `/clickup/*` → `https://api.clickup.com/api/v2/*` (`nginx.conf` `location /clickup/` block). `resolver` directive required for nginx-alpine to resolve `api.clickup.com` at runtime; `proxy_ssl_server_name on` required for SNI. `vite.config.ts` mirrors proxy under `server.proxy` for parity in `vite dev`. Personal API tokens (`pk_*`) sent in `Authorization` header verbatim, no `Bearer ` prefix (OAuth would need it; not used).

**Config** (`src/hooks/useClickUpConfig.ts`): `ClickUpConfig` (`token`, `teamId`, `spaceId`, `folder`, `listId`, optional `lastSyncAt`) persisted to `localStorage['clickup-config']`. `folder` is real folder id or literal `'folderless'` for spaces with lists directly under space. Token in localStorage — acceptable for personal tool but readable by XSS (noted in `ClickUpSettings.tsx`).

**Settings UI** (`components/ClickUpSettings.tsx`): cascading dropdowns Workspace → Space → Folder → List. Token entry has explicit "Load" button to avoid firing requests on every keystroke. Mounted from "ClickUp" button in `App.tsx` header.

**API client** (`src/lib/clickup.ts`): pure functions over `fetch('/clickup/...')`. Tokens passed as first arg; nothing module-scoped. Throws `ClickUpError` (status + body) on non-2xx. `toClickUpDate`/`fromClickUpDate` translate between JS `Date` and ClickUp's "ms since epoch as STRING"; `fromClickUpDate` returns `Date | null`. `getAllTasks` paginates until page returns < 100 tasks. `CreateTaskBody` omits date fields entirely when a task has no dates; `UpdateTaskBody` accepts `start_date?: string | null` and `due_date?: string | null` — sending `null` clears the date in ClickUp. `listTeamMembers` fetches via `GET /team` (not `/team/{id}/member` — that endpoint doesn't exist). `getListStatuses(token, listId)` returns `ClickUpStatus[]` (`{ status, color, orderindex }`). `addTagToTask`/`removeTagFromTask` use `POST /task/{id}/tag/{name}` and `DELETE /task/{id}/tag/{name}`.

**Sync engine** (`src/lib/sync.ts`, `syncWithClickUp`): six phases on manual "Sync now". (1) Fetch all remote tasks — fatal on failure. (2) Each linked local task with remote match: compare `r.date_updated` to `config.lastSyncAt` — remote changed since last sync → ClickUp wins, overwrite local fields; `start`/`end` set to `remoteDate ?? undefined` (a null remote date clears the local date — no arbitrary fallback). Local-wins branch pushes via PUT, sending `null` for dates to clear them in ClickUp if local is undefined. (3) Create remote tasks for local-only rows; date fields omitted from create body when undefined. (4) Synthesize local rows for remote-only tasks — `start`/`end` set to `fromClickUpDate(...) ?? undefined`; no arbitrary today/+7days defaults. (5) Dependencies additive union: local-not-remote edges POSTed up, remote-not-local added locally. (6) Bulk `setTasks(next)` — single render. Caller (`App.tsx` `onSync`) updates `lastSyncAt`.

`sameDay(a, b)` in sync.ts accepts `Date | null | undefined` on both sides; treats null and undefined as equivalent (both mean "no date").

**Conflict policy**: ClickUp wins only when its `date_updated` postdates last sync; otherwise local propagates up.

**Synced fields**: `name`, `start`/`end` dates (optional; null/undefined preserved), `dependencies`, `priority` (push+pull; ClickUp int 1–4), `description` (push+pull), `assignees` (push+pull; push sends `{ add: [...ids], rem: [...ids] }` diff; sentinel id `-1` excluded), `status` (push+pull), `tags` (push+pull; per-tag add/remove via tag name).

**v1 limitations**: no baseline tracking → dependency *removals* don't propagate either direction (remove on both sides manually); local delete does not delete remote (`deleteTask` intentionally unexposed); no rate-limit backoff (ClickUp free tier ~100 req/min — surface 429s, retry manually); no realtime/webhook/auto-poll. Subtasks, comments, attachments, time tracking, `progress` not synced.

**Hook contract** (`src/hooks/useTasks.ts`): raw `useState` setter exposed as `setTasks` so `syncWithClickUp` does single bulk replacement. Persistence `useEffect` watches `tasks`, writes `localStorage['gantt-tasks']`; bulk replacement round-trips through JSON serialize/deserialize cleanly (dates → ISO string → Date; undefined dates → field absent in JSON → undefined on deserialize).
