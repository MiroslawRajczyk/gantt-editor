import { useEffect, useRef, useState } from 'react'
import FrappeGantt from 'frappe-gantt'
import type FrappeGanttNS from 'frappe-gantt'
import 'frappe-gantt-css'
import type { GanttTask } from '../types'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface Props {
  tasks: GanttTask[]
  onDateChange: (id: string, start: Date, end: Date) => void
  onContainerReady: (el: HTMLElement) => void
  onToggleDependency: (sourceId: string, targetId: string) => void
}

export function GanttPanel({
  tasks,
  onDateChange,
  onContainerReady,
  onToggleDependency,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<InstanceType<typeof FrappeGantt> | null>(null)

  // Always-current refs for callbacks set once at gantt init
  const onDateChangeRef = useRef(onDateChange)
  const onContainerReadyRef = useRef(onContainerReady)
  const onToggleDependencyRef = useRef(onToggleDependency)
  useEffect(() => {
    onDateChangeRef.current = onDateChange
    onContainerReadyRef.current = onContainerReady
    onToggleDependencyRef.current = onToggleDependency
  })

  // Connect-mode state (React) + refs (for use inside frappe-gantt callbacks)
  const [connectMode, setConnectMode] = useState(false)
  const [connectSource, setConnectSource] = useState<string | null>(null)
  const connectModeRef = useRef(false)
  const connectSourceRef = useRef<string | null>(null)

  // When a drag originates inside the gantt, skip the next refresh so we
  // don't reset the scroll position that frappe-gantt just set.
  const skipNextRefreshRef = useRef(false)

  // This ref is reassigned every render so the gantt on_click callback always
  // has access to up-to-date closures (connectModeRef etc. are refs so stale
  // values are not an issue, but onToggleDependencyRef is updated here too).
  const ganttClickRef = useRef<(task: FrappeGanttNS.Task) => void>(null!)
  ganttClickRef.current = (task: FrappeGanttNS.Task) => {
    if (!connectModeRef.current || !task.id) return
    const src = connectSourceRef.current

    if (!src) {
      // First click — mark as predecessor
      connectSourceRef.current = task.id
      setConnectSource(task.id)
      highlightBar(task.id, true)
    } else if (task.id === src) {
      // Clicked the same bar — cancel selection
      highlightBar(src, false)
      connectSourceRef.current = null
      setConnectSource(null)
    } else {
      // Second click — create / remove dependency, exit connect mode
      highlightBar(src, false)
      connectSourceRef.current = null
      connectModeRef.current = false
      setConnectMode(false)
      setConnectSource(null)
      onToggleDependencyRef.current(src, task.id)
    }
  }

  function highlightBar(taskId: string, on: boolean) {
    containerRef.current
      ?.querySelector(`[data-id="${taskId}"]`)
      ?.classList.toggle('bar--selected', on)
  }

  function toggleConnectMode() {
    if (connectModeRef.current) {
      // Exit
      if (connectSourceRef.current) highlightBar(connectSourceRef.current, false)
      connectSourceRef.current = null
      connectModeRef.current = false
      setConnectMode(false)
      setConnectSource(null)
    } else {
      connectModeRef.current = true
      setConnectMode(true)
    }
  }

  // Escape cancels connect mode
  useEffect(() => {
    if (!connectMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleConnectMode()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [connectMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!containerRef.current) return

    if (tasks.length === 0) {
      if (ganttRef.current) {
        ganttRef.current.clear()
        ganttRef.current = null
      }
      return
    }

    const frappeTasks = tasks.map(t => ({
      id: t.id,
      name: t.name,
      start: toDateStr(t.start),
      end: toDateStr(t.end),
      progress: t.progress,
      dependencies: t.dependencies?.join(',') ?? '',
    }))

    if (ganttRef.current) {
      if (skipNextRefreshRef.current) {
        skipNextRefreshRef.current = false
        return
      }
      ganttRef.current.refresh(frappeTasks)
    } else {
      const panelHeight = containerRef.current.clientHeight

      ganttRef.current = new FrappeGantt(containerRef.current, frappeTasks, {
        view_mode: 'Week',
        container_height: panelHeight,
        popup: false,
        on_date_change: (task, start, end) => {
          if (task.id) {
            skipNextRefreshRef.current = true
            onDateChangeRef.current(task.id, start, end)
          }
        },
        on_click: (task) => ganttClickRef.current(task),
      })

      const ganttContainer = containerRef.current.querySelector(
        '.gantt-container',
      ) as HTMLElement | null
      if (ganttContainer) {
        ganttContainer.style.height = `${panelHeight}px`
        onContainerReadyRef.current(ganttContainer)
      }
    }
  }, [tasks])

  const connectLabel = connectSource
    ? `Click the successor task  (Esc to cancel)`
    : `Click the predecessor task  (Esc to cancel)`

  return (
    <div className={`gantt-panel${connectMode ? ' gantt-panel--connecting' : ''}`}>
      <div className="gantt-panel__toolbar">
        <button
          className={`gantt-panel__connect-btn${connectMode ? ' gantt-panel__connect-btn--active' : ''}`}
          onClick={toggleConnectMode}
          title="Connect two tasks as predecessor → successor"
        >
          {connectMode ? '✕ Cancel' : '⇢ Connect tasks'}
        </button>
        {connectMode && (
          <span className="gantt-panel__connect-hint">{connectLabel}</span>
        )}
      </div>

      {tasks.length === 0 && (
        <p className="gantt-panel__empty-msg">
          Add a task on the left to see the Gantt chart.
        </p>
      )}
      <div
        ref={containerRef}
        className="gantt-panel__chart"
        style={{ display: tasks.length > 0 ? 'block' : 'none' }}
      />
    </div>
  )
}
