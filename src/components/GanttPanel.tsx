import { useEffect, useRef, useState } from 'react'
import FrappeGantt from 'frappe-gantt'
import type FrappeGanttNS from 'frappe-gantt'
import type { GanttTask } from '../types'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getAllSuccessors(taskId: string, allTasks: GanttTask[]): string[] {
  const result: string[] = []
  const queue = [taskId]
  const visited = new Set<string>([taskId])
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const task of allTasks) {
      if (task.dependencies?.includes(current) && !visited.has(task.id)) {
        visited.add(task.id)
        result.push(task.id)
        queue.push(task.id)
      }
    }
  }
  return result
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
  const tasksRef = useRef(tasks)
  useEffect(() => {
    onDateChangeRef.current = onDateChange
    onContainerReadyRef.current = onContainerReady
    onToggleDependencyRef.current = onToggleDependency
    tasksRef.current = tasks
  })

  // Connect-mode state (React) + refs (for use inside frappe-gantt callbacks)
  const [connectMode, setConnectMode] = useState(false)
  const [connectSource, setConnectSource] = useState<string | null>(null)
  const connectModeRef = useRef(false)
  const connectSourceRef = useRef<string | null>(null)

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
      const gc = containerRef.current.querySelector('.gantt-container') as HTMLElement | null
      const sl = gc?.scrollLeft ?? 0
      const st = gc?.scrollTop ?? 0
      ganttRef.current.refresh(frappeTasks)
      if (gc) { gc.scrollLeft = sl; gc.scrollTop = st }
    } else {
      const panelHeight = containerRef.current.clientHeight

      ganttRef.current = new FrappeGantt(containerRef.current, frappeTasks, {
        view_mode: 'Week',
        container_height: panelHeight,
        popup: false,
        on_date_change: (task, start, end) => {
          if (!task.id) return
          const allTasks = tasksRef.current
          const prev = allTasks.find(t => t.id === task.id)
          onDateChangeRef.current(task.id, start, end)
          // Only propagate on a pure drag (duration unchanged within 2s tolerance).
          // Resizing one edge changes the duration by at least a full day, so
          // the 2s window safely excludes the frappe-gantt -1s end adjustment.
          if (prev) {
            const deltaMs = start.getTime() - prev.start.getTime()
            const prevDuration = prev.end.getTime() - prev.start.getTime()
            const newDuration = end.getTime() - start.getTime()
            const isDrag = deltaMs !== 0 && Math.abs(newDuration - prevDuration) < 2000
            if (isDrag) {
              for (const sid of getAllSuccessors(task.id, allTasks)) {
                const s = allTasks.find(t => t.id === sid)
                if (s) {
                  onDateChangeRef.current(
                    sid,
                    new Date(s.start.getTime() + deltaMs),
                    new Date(s.end.getTime() + deltaMs),
                  )
                }
              }
            }
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
