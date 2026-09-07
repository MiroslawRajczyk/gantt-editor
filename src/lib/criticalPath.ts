// Critical path = the longest chain of dependent tasks, weighted by task
// duration. Gaps between a predecessor's end and its successor's start are
// ignored on purpose: dates in this editor are set by hand, not derived from a
// scheduler, so a slack-based rule would drop tasks from the chain merely
// because the user left room between two bars.

import type { GanttTask } from '../types'
import { isMilestone } from '../utils'

export interface CriticalPath {
  taskIds: Set<string>
  /** `${predecessorId}->${successorId}` for every link on a longest chain. */
  edges: Set<string>
}

export const EMPTY_CRITICAL: CriticalPath = { taskIds: new Set(), edges: new Set() }

export const edgeKey = (from: string, to: string): string => `${from}->${to}`

const DAY_MS = 86400000

/** Inclusive day count, matching how a bar is drawn. A milestone spans zero. */
function durationDays(t: GanttTask): number {
  if (isMilestone(t) || !t.start || !t.end) return 0
  return Math.max(0, Math.round((t.end.getTime() - t.start.getTime()) / DAY_MS) + 1)
}

export function computeCriticalPath(tasks: GanttTask[]): CriticalPath {
  // Only dated tasks take part: a dateless row has no bar and no arrows, so it
  // breaks a chain instead of passing it through.
  const nodes = new Map<string, GanttTask>()
  for (const t of tasks) if (t.start && t.end) nodes.set(t.id, t)

  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const t of nodes.values()) {
    const ps = (t.dependencies ?? []).filter(id => id !== t.id && nodes.has(id))
    if (ps.length === 0) continue
    preds.set(t.id, ps)
    for (const p of ps) {
      const list = succs.get(p)
      if (list) list.push(t.id)
      else succs.set(p, [t.id])
    }
  }
  if (preds.size === 0) return EMPTY_CRITICAL

  const dur = new Map<string, number>()
  for (const t of nodes.values()) dur.set(t.id, durationDays(t))

  // Longest chain ending at / starting from each node. Memoized and cycle-safe:
  // a back edge inside an in-progress walk contributes 0 rather than recursing,
  // since the UI does not stop the user from creating a dependency cycle.
  const longest = (adj: Map<string, string[]>): Map<string, number> => {
    const memo = new Map<string, number>()
    const visiting = new Set<string>()
    const walk = (id: string): number => {
      const cached = memo.get(id)
      if (cached !== undefined) return cached
      if (visiting.has(id)) return 0
      visiting.add(id)
      let best = 0
      for (const next of adj.get(id) ?? []) {
        const v = walk(next)
        if (v > best) best = v
      }
      visiting.delete(id)
      const total = (dur.get(id) ?? 0) + best
      memo.set(id, total)
      return total
    }
    for (const id of nodes.keys()) walk(id)
    return memo
  }

  const chainTo = longest(preds)   // longest chain ending at the node
  const chainFrom = longest(succs) // longest chain starting at the node

  // Every chain of two or more tasks ends on a node that has a predecessor, so
  // taking the maximum over those keeps a lone unconnected task — however long
  // it runs — from being reported as "the critical path".
  let maxTotal = 0
  for (const id of preds.keys()) {
    const v = chainTo.get(id) ?? 0
    if (v > maxTotal) maxTotal = v
  }
  if (maxTotal <= 0) return EMPTY_CRITICAL

  // A node sits on a longest chain when the best chain through it is the
  // longest one overall. Ties are all kept rather than picking one arbitrarily.
  const taskIds = new Set<string>()
  for (const id of nodes.keys()) {
    if (!preds.has(id) && !succs.has(id)) continue
    const through = (chainTo.get(id) ?? 0) + (chainFrom.get(id) ?? 0) - (dur.get(id) ?? 0)
    if (through === maxTotal) taskIds.add(id)
  }

  const edges = new Set<string>()
  for (const [to, ps] of preds) {
    if (!taskIds.has(to)) continue
    for (const from of ps) {
      if (!taskIds.has(from)) continue
      if ((chainTo.get(from) ?? 0) + (chainFrom.get(to) ?? 0) === maxTotal) {
        edges.add(edgeKey(from, to))
      }
    }
  }

  return { taskIds, edges }
}
