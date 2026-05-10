import { useState, useEffect } from 'react'
import type { GanttTask } from '../types'

const STORAGE_KEY = 'gantt-tasks'

function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function deserialize(raw: string): GanttTask[] {
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
  return parsed.map(t => ({
    ...(t as Omit<GanttTask, 'start' | 'end'>),
    start: new Date(t.start as string),
    end: new Date(t.end as string),
  }))
}

function loadFromStorage(): GanttTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return deserialize(raw)
  } catch {
    // corrupted storage — start fresh
  }
  return [
    {
      id: crypto.randomUUID(),
      name: 'Example task',
      start: today(),
      end: addDays(today(), 7),
      progress: 0,
    },
  ]
}

export function useTasks() {
  const [tasks, setTasks] = useState<GanttTask[]>(loadFromStorage)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  function addTask() {
    const t = today()
    setTasks(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: 'New task',
        start: t,
        end: addDays(t, 7),
        progress: 0,
      },
    ])
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function updateTask(id: string, patch: Partial<GanttTask>) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  return { tasks, setTasks, addTask, removeTask, updateTask }
}
