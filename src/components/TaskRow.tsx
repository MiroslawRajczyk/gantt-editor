import { useState, useRef, useEffect } from 'react'
import type { GanttTask } from '../types'
import { GANTT_ROW_HEIGHT } from '../constants'
import { DatePicker } from './DatePicker'

interface Props {
  task: GanttTask
  index: number
  onUpdate: (patch: Partial<GanttTask>) => void
  onRemove: () => void
  onOpenDetail: () => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  onDragEnd: () => void
  isDragOver: boolean
}

export function TaskRow({ task, index, onUpdate, onRemove, onOpenDetail, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(task.name)
  }, [task.name, editing])

  function commitName() {
    const trimmed = draft.trim() || task.name
    setDraft(trimmed)
    onUpdate({ name: trimmed })
    setEditing(false)
  }

  return (
    <div
      className={`task-row${isDragOver ? ' task-row--drag-over' : ''}`}
      style={{ height: GANTT_ROW_HEIGHT }}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
    >
      <span className="task-row__grip" aria-hidden="true">⠿</span>

      <div className="task-row__name">
        {editing ? (
          <input
            ref={inputRef}
            className="task-row__name-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setDraft(task.name); setEditing(false) }
            }}
          />
        ) : (
          <span
            className="task-row__name-text"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {task.name}
          </span>
        )}
      </div>

      <div className="task-row__dates">
        <DatePicker
          value={task.start}
          onChange={d => onUpdate({ start: d, ...(task.end && d && d > task.end ? { end: d } : {}) })}
          title="Start date"
        />
        <span className="task-row__date-sep">→</span>
        <DatePicker
          value={task.end}
          onChange={d => onUpdate({ end: d, ...(task.start && d && d < task.start ? { start: d } : {}) })}
          title="Due date"
        />
      </div>

      <button
        className="task-row__detail-btn"
        onClick={onOpenDetail}
        aria-label={`Open details for ${task.name}`}
        title="Open details"
        type="button"
      >
        ⤢
      </button>
      <button
        className="task-row__delete"
        onClick={onRemove}
        aria-label={`Delete ${task.name}`}
        title="Delete task"
      >
        ✕
      </button>
    </div>
  )
}
