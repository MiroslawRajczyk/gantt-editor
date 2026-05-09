import { useEffect, useRef } from 'react'
import FrappeGantt from 'frappe-gantt'
import 'frappe-gantt-css'
import type { GanttTask } from '../types'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface Props {
  tasks: GanttTask[]
  onDateChange: (id: string, start: Date, end: Date) => void
  onContainerReady: (el: HTMLElement) => void
}

export function GanttPanel({ tasks, onDateChange, onContainerReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<InstanceType<typeof FrappeGantt> | null>(null)
  const onDateChangeRef = useRef(onDateChange)
  const onContainerReadyRef = useRef(onContainerReady)
  // When a drag originates inside the gantt, skip the next refresh so we
  // don't reset the scroll position that frappe-gantt just set.
  const skipNextRefreshRef = useRef(false)

  useEffect(() => {
    onDateChangeRef.current = onDateChange
    onContainerReadyRef.current = onContainerReady
  })

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
    }))

    if (ganttRef.current) {
      if (skipNextRefreshRef.current) {
        skipNextRefreshRef.current = false
        return
      }
      ganttRef.current.refresh(frappeTasks)
    } else {
      // Measure the visible panel height so we can fix the gantt-container to
      // that exact height. Without this frappe-gantt sets height: auto and the
      // container expands to fit all content → no scrollbar ever appears.
      const panelHeight = containerRef.current.clientHeight

      ganttRef.current = new FrappeGantt(containerRef.current, frappeTasks, {
        view_mode: 'Week',
        // A numeric value tells frappe-gantt NOT to set container height via JS,
        // so our forced inline style below is preserved through refresh() calls.
        container_height: panelHeight,
        on_date_change: (task, start, end) => {
          if (task.id) {
            skipNextRefreshRef.current = true
            onDateChangeRef.current(task.id, start, end)
          }
        },
      })

      // Force .gantt-container to a fixed height so overflow: auto shows a
      // scrollbar when the SVG content is taller than the panel.
      const ganttContainer = containerRef.current.querySelector(
        '.gantt-container',
      ) as HTMLElement | null
      if (ganttContainer) {
        ganttContainer.style.height = `${panelHeight}px`
        // .gantt-container is stable across refresh() calls — attach scroll
        // listener once here.
        onContainerReadyRef.current(ganttContainer)
      }
    }
  }, [tasks])

  return (
    <div className="gantt-panel">
      {tasks.length === 0 && (
        <p className="gantt-panel__empty-msg">
          Add a task on the left to see the Gantt chart.
        </p>
      )}
      {/* Always mounted so containerRef is always valid for cleanup */}
      <div
        ref={containerRef}
        className="gantt-panel__chart"
        style={{ display: tasks.length > 0 ? 'block' : 'none' }}
      />
    </div>
  )
}
