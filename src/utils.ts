import type { GanttTask } from './types'

export function getAllSuccessors(taskId: string, allTasks: GanttTask[]): string[] {
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
