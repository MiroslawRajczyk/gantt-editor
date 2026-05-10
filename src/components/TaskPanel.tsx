import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GanttTask } from '../types'
import { TaskRow } from './TaskRow'
import { GANTT_HEADER_HEIGHT, GANTT_TOOLBAR_HEIGHT } from '../constants'

interface Props {
  tasks: GanttTask[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<GanttTask>) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  listRef: RefObject<HTMLDivElement>
}

export function TaskPanel({ tasks, onAdd, onRemove, onUpdate, onReorder, listRef }: Props) {
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(index: number) {
    if (dragIndexRef.current !== null) {
      onReorder(dragIndexRef.current, index)
    }
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  return (
    <div className="task-panel">
      <div className="task-panel__header" style={{ height: GANTT_HEADER_HEIGHT + GANTT_TOOLBAR_HEIGHT }}>
        <h2 className="task-panel__title">Tasks</h2>
        <button className="task-panel__add-btn" onClick={onAdd}>
          + Add task
        </button>
      </div>

      <div className="task-panel__list" ref={listRef}>
        {tasks.length === 0 && (
          <p className="task-panel__empty">No tasks yet. Add one above.</p>
        )}
        {tasks.map((task, idx) => (
          <TaskRow
            key={task.id}
            task={task}
            index={idx}
            onUpdate={patch => onUpdate(task.id, patch)}
            onRemove={() => onRemove(task.id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverIndex === idx}
          />
        ))}
      </div>
    </div>
  )
}
