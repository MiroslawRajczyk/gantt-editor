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

**Core type** (`src/types.ts`): `GanttTask` has `id`, `name`, `start: Date`, `end: Date`, `progress: number` (kept in the data model but not displayed in the chart), and `dependencies?: string[]`.

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
