import { useCallback, useRef, useState } from 'react'
import { useTasks } from './hooks/useTasks'
import { TaskPanel } from './components/TaskPanel'
import { GanttPanel } from './components/GanttPanel'
import { Divider } from './components/Divider'
import { getAllSuccessors } from './utils'
import type { GanttTask } from './types'
import './App.css'

const MIN_PCT = 15
const MAX_PCT = 70
const DEFAULT_PCT = 30

export default function App() {
  const { tasks, addTask, removeTask, updateTask } = useTasks()
  const [leftPct, setLeftPct] = useState(DEFAULT_PCT)
  const containerRef = useRef<HTMLDivElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)
  const lhsFocusIdRef = useRef<string | null>(null)

  const handleResize = useCallback((deltaX: number) => {
    const containerWidth = containerRef.current?.offsetWidth ?? window.innerWidth
    setLeftPct(prev => {
      const newPct = prev + (deltaX / containerWidth) * 100
      return Math.min(MAX_PCT, Math.max(MIN_PCT, newPct))
    })
  }, [])

  const handleTaskUpdate = useCallback(
    (id: string, patch: Partial<GanttTask>) => {
      lhsFocusIdRef.current = id
      updateTask(id, patch)
      if ('end' in patch && patch.end !== undefined) {
        const prev = tasks.find(t => t.id === id)
        if (prev) {
          const delta = patch.end.getTime() - prev.end.getTime()
          if (delta !== 0) {
            for (const sid of getAllSuccessors(id, tasks)) {
              const s = tasks.find(t => t.id === sid)
              if (s) {
                updateTask(sid, {
                  start: new Date(s.start.getTime() + delta),
                  end: new Date(s.end.getTime() + delta),
                })
              }
            }
          }
        }
      }
    },
    [tasks, updateTask],
  )

  const handleToggleDependency = useCallback(
    (sourceId: string, targetId: string) => {
      const target = tasks.find(t => t.id === targetId)
      if (!target) return
      const deps = target.dependencies ?? []
      updateTask(targetId, {
        dependencies: deps.includes(sourceId)
          ? deps.filter(d => d !== sourceId)
          : [...deps, sourceId],
      })
    },
    [tasks, updateTask],
  )

  const handleContainerReady = useCallback((ganttContainer: HTMLElement) => {
    const listEl = taskListRef.current
    if (!listEl) return

    const syncGanttToList = () => {
      if (isSyncingRef.current) return
      isSyncingRef.current = true
      listEl.scrollTop = ganttContainer.scrollTop
      isSyncingRef.current = false
    }

    const syncListToGantt = () => {
      if (isSyncingRef.current) return
      isSyncingRef.current = true
      ganttContainer.scrollTop = listEl.scrollTop
      isSyncingRef.current = false
    }

    ganttContainer.addEventListener('scroll', syncGanttToList)
    listEl.addEventListener('scroll', syncListToGantt)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__logo">Gantt Editor</span>
      </header>
      <div className="app__body" ref={containerRef}>
        <div className="app__panel app__panel--left" style={{ width: `${leftPct}%` }}>
          <TaskPanel
            tasks={tasks}
            onAdd={addTask}
            onRemove={removeTask}
            onUpdate={handleTaskUpdate}
            listRef={taskListRef}
          />
        </div>
        <Divider onResize={handleResize} />
        <div className="app__panel app__panel--right" style={{ width: `${100 - leftPct}%` }}>
          <GanttPanel
            tasks={tasks}
            onDateChange={(id, start, end) => updateTask(id, { start, end })}
            onContainerReady={handleContainerReady}
            onToggleDependency={handleToggleDependency}
            focusIdRef={lhsFocusIdRef}
          />
        </div>
      </div>
    </div>
  )
}
