export interface GanttTask {
  id: string
  name: string
  start: Date
  end: Date
  progress: number
  dependencies?: string[]
}
