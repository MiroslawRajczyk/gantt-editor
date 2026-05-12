import { useCallback, useRef, useState } from 'react'
import { useTasks } from './hooks/useTasks'
import { useClickUpConfig } from './hooks/useClickUpConfig'
import { TaskPanel } from './components/TaskPanel'
import { GanttPanel } from './components/GanttPanel'
import { Divider } from './components/Divider'
import { ClickUpSettings } from './components/ClickUpSettings'
import { TaskDetailPopup } from './components/TaskDetailPopup'
import { getAllSuccessors } from './utils'
import { syncWithClickUp } from './lib/sync'
import type { GanttTask, SyncReport } from './types'
import './App.css'

const MIN_PCT = 15
const MAX_PCT = 70
const DEFAULT_PCT = 30

export default function App() {
  const { tasks, setTasks, addTask, removeTask, updateTask, reorderTask, clearTasks } = useTasks()
  const { config, setConfig } = useClickUpConfig()
  const [leftPct, setLeftPct] = useState(DEFAULT_PCT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastReport, setLastReport] = useState<SyncReport | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)
  const scrollCleanupRef = useRef<(() => void) | null>(null)
  const lhsFocusIdRef = useRef<string | null>(null)

  const onSync = useCallback(async () => {
    if (!config?.token || !config.listId) return
    setSyncing(true)
    const t0 = performance.now()
    try {
      const report = await syncWithClickUp(config, tasks, setTasks)
      setLastReport(report)
      setConfig({ ...config, lastSyncAt: new Date().toISOString() })
    } catch (e) {
      setLastReport({
        added: 0,
        updatedFromRemote: 0,
        pushedToRemote: 0,
        deletedLocal: 0,
        createdRemote: 0,
        depsAdded: 0,
        depsAddedFromRemote: 0,
        errors: [String(e)],
        durationMs: performance.now() - t0,
      })
    } finally {
      setSyncing(false)
    }
  }, [config, tasks, setTasks, setConfig])

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
        if (prev && prev.end !== undefined) {
          const delta = patch.end.getTime() - prev.end.getTime()
          if (delta !== 0) {
            for (const sid of getAllSuccessors(id, tasks)) {
              const s = tasks.find(t => t.id === sid)
              if (s && s.start && s.end) {
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

    scrollCleanupRef.current?.()

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

    scrollCleanupRef.current = () => {
      ganttContainer.removeEventListener('scroll', syncGanttToList)
      listEl.removeEventListener('scroll', syncListToGantt)
    }
  }, [])

  const reportSummary = (r: SyncReport): string =>
    r.errors.length === 0
      ? `+${r.added} from CU · ${r.createdRemote} → CU · ${r.updatedFromRemote} pulled · ${r.pushedToRemote} pushed · ${r.deletedLocal} removed · ${r.depsAdded + r.depsAddedFromRemote} deps`
      : `Sync errors: ${r.errors[0]}${r.errors.length > 1 ? ` (+${r.errors.length - 1} more)` : ''}`

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__logo">Gantt Editor</span>
        <div className="app__header-spacer" />
        {lastReport && (
          <span
            className={`app__sync-report${lastReport.errors.length ? ' app__sync-report--err' : ''}`}
            title={lastReport.errors.join('\n') || undefined}
          >
            {reportSummary(lastReport)}
          </span>
        )}
        {config?.lastSyncAt && (
          <span className="app__sync-stamp">
            Last sync: {new Date(config.lastSyncAt).toLocaleTimeString()}
          </span>
        )}
        {config?.token && config.listId && (
          <button
            className="app__sync-btn"
            onClick={onSync}
            disabled={syncing}
            type="button"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        <button
          className="app__settings-btn"
          onClick={() => setSettingsOpen(true)}
          type="button"
        >
          ClickUp
        </button>
      </header>
      <div className="app__body" ref={containerRef}>
        <div className="app__panel app__panel--left" style={{ width: `${leftPct}%` }}>
          <TaskPanel
            tasks={tasks}
            onAdd={addTask}
            onClear={() => { if (confirm('Remove all tasks?')) clearTasks() }}
            onRemove={removeTask}
            onUpdate={handleTaskUpdate}
            onReorder={reorderTask}
            onOpenDetail={(id) => setDetailTaskId(id)}
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
      <ClickUpSettings
        open={settingsOpen}
        config={config}
        onSave={(next) => {
          setConfig(next)
          setSettingsOpen(false)
        }}
        onClose={() => setSettingsOpen(false)}
      />
      {detailTaskId && (() => {
        const t = tasks.find(task => task.id === detailTaskId)
        return t ? (
          <TaskDetailPopup
            task={t}
            allTasks={tasks}
            onClose={() => setDetailTaskId(null)}
            onUpdate={patch => handleTaskUpdate(detailTaskId, patch)}
            clickupToken={config?.token}
            clickupTeamId={config?.teamId}
            clickupListId={config?.listId}
            clickupSpaceId={config?.spaceId}
          />
        ) : null
      })()}
    </div>
  )
}
