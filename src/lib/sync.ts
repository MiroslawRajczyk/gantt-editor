import type { ClickUpConfig, GanttTask, SyncReport } from '../types'
import {
  addDependency,
  createTask,
  fromClickUpDate,
  getAllTasks,
  toClickUpDate,
  updateTask,
  type RemoteTask,
} from './clickup'

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b
  return a.getTime() === b.getTime()
}

function buildRemoteEdgeKey(taskId: string, dependsOn: string): string {
  return `${taskId}->${dependsOn}`
}

export async function syncWithClickUp(
  config: ClickUpConfig,
  localTasks: GanttTask[],
  setTasks: (next: GanttTask[]) => void,
): Promise<SyncReport> {
  const t0 = performance.now()
  const report: SyncReport = {
    added: 0,
    updatedFromRemote: 0,
    pushedToRemote: 0,
    deletedLocal: 0,
    createdRemote: 0,
    depsAdded: 0,
    depsAddedFromRemote: 0,
    errors: [],
    durationMs: 0,
  }

  const lastSyncMs = config.lastSyncAt ? Date.parse(config.lastSyncAt) : 0
  const { token, listId } = config

  // Phase 0 — fetch remote view (fatal on failure)
  const remote = await getAllTasks(token, listId)
  const remoteById = new Map<string, RemoteTask>(remote.map(r => [r.id, r]))

  // Phase 1 — partition local
  const linked = localTasks.filter(t => t.clickupId)
  const unlinked = localTasks.filter(t => !t.clickupId)

  // Working set we'll commit at the end
  const next: GanttTask[] = []

  // Phase 2 — reconcile linked rows
  for (const l of linked) {
    const r = remoteById.get(l.clickupId!)
    if (!r) {
      report.deletedLocal++
      continue
    }
    const remoteUpdated = Number(r.date_updated || 0)
    const remoteChangedSinceSync = lastSyncMs === 0 || remoteUpdated > lastSyncMs
    const remoteStart = fromClickUpDate(r.start_date)
    const remoteEnd = fromClickUpDate(r.due_date)

    if (remoteChangedSinceSync) {
      const fieldsChanged =
        l.name !== r.name ||
        !sameDay(l.start, remoteStart) ||
        !sameDay(l.end, remoteEnd)
      next.push({
        ...l,
        name: r.name,
        start: remoteStart ?? l.start,
        end: remoteEnd ?? l.end,
      })
      if (fieldsChanged) report.updatedFromRemote++
    } else {
      const localDiffersFromRemote =
        l.name !== r.name ||
        !sameDay(l.start, remoteStart) ||
        !sameDay(l.end, remoteEnd)
      if (localDiffersFromRemote) {
        try {
          await updateTask(token, r.id, {
            name: l.name,
            start_date: toClickUpDate(l.start),
            due_date: toClickUpDate(l.end),
            start_date_time: false,
            due_date_time: false,
          })
          report.pushedToRemote++
        } catch (e) {
          report.errors.push(`updateTask(${r.id}): ${String(e)}`)
        }
      }
      next.push({ ...l })
    }
  }

  // Phase 3 — create remote for unlinked
  for (const u of unlinked) {
    try {
      const created = await createTask(token, listId, {
        name: u.name,
        start_date: toClickUpDate(u.start),
        due_date: toClickUpDate(u.end),
        start_date_time: false,
        due_date_time: false,
      })
      remoteById.set(created.id, created)
      next.push({ ...u, clickupId: created.id })
      report.createdRemote++
    } catch (e) {
      report.errors.push(`createTask(${u.name}): ${String(e)}`)
      next.push({ ...u })
    }
  }

  // Phase 4 — pull-down for remote-only tasks
  const linkedCuids = new Set(next.map(t => t.clickupId).filter((x): x is string => !!x))
  for (const r of remote) {
    if (linkedCuids.has(r.id)) continue
    const today = (() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    })()
    next.push({
      id: crypto.randomUUID(),
      clickupId: r.id,
      name: r.name,
      start: fromClickUpDate(r.start_date) ?? today,
      end: fromClickUpDate(r.due_date) ?? addDays(today, 7),
      progress: 0,
    })
    report.added++
  }

  // Phase 5 — dependencies (additive union)
  // Map clickupId <-> local id (only over tasks that have a clickupId)
  const cuidToLocal = new Map<string, string>()
  const localToCuid = new Map<string, string>()
  for (const t of next) {
    if (t.clickupId) {
      cuidToLocal.set(t.clickupId, t.id)
      localToCuid.set(t.id, t.clickupId)
    }
  }

  // Build local edges from next
  const localEdges = new Set<string>()
  const localPredsByCuid = new Map<string, Set<string>>()
  for (const t of next) {
    const cuid = t.clickupId
    if (!cuid) continue
    const preds = t.dependencies ?? []
    const set = new Set<string>()
    for (const predLocalId of preds) {
      const predCuid = localToCuid.get(predLocalId)
      if (!predCuid) continue
      set.add(predCuid)
      localEdges.add(buildRemoteEdgeKey(cuid, predCuid))
    }
    localPredsByCuid.set(cuid, set)
  }

  // Build remote edges from latest remote view (incl. newly created tasks, which have no deps yet)
  const remoteEdges = new Set<string>()
  const remotePredsByCuid = new Map<string, Set<string>>()
  for (const r of remoteById.values()) {
    const set = new Set<string>()
    for (const dep of r.dependencies ?? []) {
      if (dep.task_id !== r.id) continue
      set.add(dep.depends_on)
      remoteEdges.add(buildRemoteEdgeKey(r.id, dep.depends_on))
    }
    remotePredsByCuid.set(r.id, set)
  }

  // Push local-only edges up
  for (const edge of localEdges) {
    if (remoteEdges.has(edge)) continue
    const [taskCuid, predCuid] = edge.split('->')
    try {
      await addDependency(token, taskCuid, predCuid)
      report.depsAdded++
    } catch (e) {
      report.errors.push(`addDependency(${taskCuid} → ${predCuid}): ${String(e)}`)
    }
  }

  // Pull remote-only edges down — final local deps for each task = union
  for (const t of next) {
    const cuid = t.clickupId
    if (!cuid) continue
    const localPreds = localPredsByCuid.get(cuid) ?? new Set<string>()
    const remotePreds = remotePredsByCuid.get(cuid) ?? new Set<string>()
    const unionPreds = new Set<string>([...localPreds, ...remotePreds])
    let pulledDown = 0
    for (const p of remotePreds) {
      if (!localPreds.has(p)) pulledDown++
    }
    report.depsAddedFromRemote += pulledDown
    // Translate union back to local ids
    const finalLocalPreds: string[] = []
    for (const predCuid of unionPreds) {
      const predLocal = cuidToLocal.get(predCuid)
      if (predLocal) finalLocalPreds.push(predLocal)
    }
    t.dependencies = finalLocalPreds.length ? finalLocalPreds : undefined
  }

  // Phase 6 — commit
  setTasks(next)
  report.durationMs = performance.now() - t0
  return report
}
