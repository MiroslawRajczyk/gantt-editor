import type { RefObject } from 'react'
import type { GanttTask } from '../types'
import { TaskRow } from './TaskRow'
import { GANTT_HEADER_HEIGHT } from '../constants'

interface Props {
  tasks: GanttTask[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<GanttTask>) => void
  listRef: RefObject<HTMLDivElement>
}

export function TaskPanel({ tasks, onAdd, onRemove, onUpdate, listRef }: Props) {
  return (
    <div className="task-panel">
      <div className="task-panel__header" style={{ height: GANTT_HEADER_HEIGHT }}>
        <h2 className="task-panel__title">Tasks</h2>
        <button className="task-panel__add-btn" onClick={onAdd}>
          + Add task
        </button>
      </div>

      <div className="task-panel__list" ref={listRef}>
        {tasks.length === 0 && (
          <p className="task-panel__empty">No tasks yet. Add one above.</p>
        )}
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            onUpdate={patch => onUpdate(task.id, patch)}
            onRemove={() => onRemove(task.id)}
          />
        ))}
      </div>
    </div>
  )
}
