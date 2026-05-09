import { useState, useRef, useEffect } from 'react'
import type { GanttTask } from '../types'
import { GANTT_ROW_HEIGHT } from '../constants'

interface Props {
  task: GanttTask
  onUpdate: (patch: Partial<GanttTask>) => void
  onRemove: () => void
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function TaskRow({ task, onUpdate, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Keep draft in sync if name changes externally
  useEffect(() => {
    if (!editing) setDraft(task.name)
  }, [task.name, editing])

  function commitName() {
    const trimmed = draft.trim() || task.name
    setDraft(trimmed)
    onUpdate({ name: trimmed })
    setEditing(false)
  }

  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = new Date(e.target.value)
    if (isNaN(d.getTime())) return
    onUpdate({ start: d, end: d > task.end ? d : task.end })
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = new Date(e.target.value)
    if (isNaN(d.getTime())) return
    onUpdate({ end: d, start: d < task.start ? d : task.start })
  }

  return (
    <div className="task-row" style={{ height: GANTT_ROW_HEIGHT }}>
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
        <input
          type="date"
          className="task-row__date-input"
          title="Start date"
          value={toDateInput(task.start)}
          onChange={handleStartChange}
        />
        <span className="task-row__date-sep">→</span>
        <input
          type="date"
          className="task-row__date-input"
          title="Due date"
          value={toDateInput(task.end)}
          onChange={handleEndChange}
        />
      </div>

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
