import React, { useEffect, useRef, useState } from 'react'
import FrappeGantt from 'frappe-gantt'
import type FrappeGanttNS from 'frappe-gantt'
import type { GanttTask } from '../types'
import { getAllSuccessors } from '../utils'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface Props {
  tasks: GanttTask[]
  onDateChange: (id: string, start: Date, end: Date) => void
  onContainerReady: (el: HTMLElement) => void
  onToggleDependency: (sourceId: string, targetId: string) => void
  focusIdRef?: React.MutableRefObject<string | null>
}

export function GanttPanel({
  tasks,
  onDateChange,
  onContainerReady,
  onToggleDependency,
  focusIdRef,
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

    const frappeTasks = tasks
      .filter(t => t.start && t.end)
      .map(t => ({
        id: t.id,
        name: t.name,
        start: toDateStr(t.start!),
        end: toDateStr(t.end!),
        progress: t.progress,
        dependencies: t.dependencies?.join(',') ?? '',
      }))

    if (frappeTasks.length === 0) {
      if (ganttRef.current) {
        const oldContainer = (ganttRef.current as any).$container as HTMLElement | null
        ganttRef.current.clear()
        ganttRef.current = null
        oldContainer?.remove()
      }
      return
    }

    if (ganttRef.current) {
      // During an active drag bar_being_dragged is true — skip refresh to keep
      // bar DOM elements intact. React state still updates so LHS stays live.
      // The first render after mouseup (bar_being_dragged = null) does the refresh.
      if ((ganttRef.current as any)?.bar_being_dragged) return

      const gantt = ganttRef.current as any
      const gc = gantt.$container as HTMLElement | null
      const oldGanttStart = gantt.gantt_start ? new Date(gantt.gantt_start) : null
      const sl = gc?.scrollLeft ?? 0
      const st = gc?.scrollTop ?? 0

      ganttRef.current.refresh(frappeTasks)

      if (gc) {
        let newSl = sl
        // If left bound extended, compensate so the visible area doesn't jump
        if (oldGanttStart && gantt.gantt_start < oldGanttStart) {
          const colsAdded = (gantt.dates as Date[]).findIndex(
            (d: Date) => d >= oldGanttStart,
          )
          if (colsAdded > 0) newSl = sl + colsAdded * gantt.config.column_width
        }

        // If a LHS edit triggered this refresh, scroll to show the edited task
        const fid = focusIdRef?.current
        if (fid) {
          focusIdRef!.current = null
          const focusBar = (gantt.bars as any[])?.find(
            (b: any) => b.task?.id === fid,
          )
          if (focusBar) {
            const taskX: number = focusBar.x
            const viewLeft = newSl
            const viewRight = newSl + gc.clientWidth
            if (taskX < viewLeft || taskX + (focusBar.width ?? 0) > viewRight) {
              newSl = Math.max(0, taskX - gc.clientWidth / 3)
            }
          }
        }

        gc.scrollLeft = newSl
        gc.scrollTop = st
      }
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
          if (prev && prev.start && prev.end) {
            const startDelta = start.getTime() - prev.start.getTime()
            const prevDuration = prev.end.getTime() - prev.start.getTime()
            const newDuration = end.getTime() - start.getTime()
            const durationDelta = newDuration - prevDuration
            // Pure drag: start shifted, duration unchanged (within 2s for frappe-gantt's -1s end artifact)
            // Right-edge resize: start unchanged, end moved → durationDelta equals end delta
            // Left-edge resize: start changed, duration also changed → both conditions false, no propagation
            const propagateDelta =
              startDelta !== 0 && Math.abs(durationDelta) < 2000 ? startDelta :
              startDelta === 0 && Math.abs(durationDelta) >= 2000 ? durationDelta :
              0
            if (propagateDelta !== 0) {
              for (const sid of getAllSuccessors(task.id, allTasks)) {
                const s = allTasks.find(t => t.id === sid)
                if (s && s.start && s.end) {
                  onDateChangeRef.current(
                    sid,
                    new Date(s.start.getTime() + propagateDelta),
                    new Date(s.end.getTime() + propagateDelta),
                  )
                }
              }
            }
          }
        },
        on_click: (task) => ganttClickRef.current(task),
      })

      const ganttContainer = (ganttRef.current as any)?.$container as HTMLElement | null
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
        style={{ display: tasks.some(t => t.start && t.end) ? 'block' : 'none' }}
      />
    </div>
  )
}
