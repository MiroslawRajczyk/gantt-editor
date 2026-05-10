import { useState, useRef, useEffect } from 'react'
import type { GanttTask } from '../types'
import { GANTT_ROW_HEIGHT } from '../constants'

interface Props {
  task: GanttTask
  index: number
  onUpdate: (patch: Partial<GanttTask>) => void
  onRemove: () => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  onDragEnd: () => void
  isDragOver: boolean
}

function toDateDisplay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function parseDateDisplay(s: string): Date | null {
  const [dd, mm, yyyy] = s.split('.')
  if (!dd || !mm || !yyyy) return null
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return isNaN(d.getTime()) ? null : d
}

export function TaskRow({ task, index, onUpdate, onRemove, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.name)
  const [startDraft, setStartDraft] = useState(() => toDateDisplay(task.start))
  const [endDraft, setEndDraft] = useState(() => toDateDisplay(task.end))
  const inputRef = useRef<HTMLInputElement>(null)
  const hiddenStartRef = useRef<HTMLInputElement>(null)
  const hiddenEndRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(task.name)
  }, [task.name, editing])

  useEffect(() => { setStartDraft(toDateDisplay(task.start)) }, [task.start])
  useEffect(() => { setEndDraft(toDateDisplay(task.end)) }, [task.end])

  function commitName() {
    const trimmed = draft.trim() || task.name
    setDraft(trimmed)
    onUpdate({ name: trimmed })
    setEditing(false)
  }

  function commitStart() {
    const d = parseDateDisplay(startDraft)
    if (!d) { setStartDraft(toDateDisplay(task.start)); return }
    onUpdate({ start: d, end: d > task.end ? d : task.end })
  }

  function commitEnd() {
    const d = parseDateDisplay(endDraft)
    if (!d) { setEndDraft(toDateDisplay(task.end)); return }
    onUpdate({ end: d, start: d < task.start ? d : task.start })
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
        <div className="task-row__date-field">
          <input
            type="text"
            className="task-row__date-input"
            title="Start date"
            placeholder="DD.MM.YYYY"
            value={startDraft}
            onChange={e => setStartDraft(e.target.value)}
            onBlur={commitStart}
          />
          <button
            className="task-row__date-cal"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); hiddenStartRef.current?.showPicker() }}
            aria-label="Open start date calendar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <rect x="0.65" y="1.65" width="10.7" height="9.7" rx="1.2"/>
              <line x1="0.65" y1="4.65" x2="11.35" y2="4.65"/>
              <line x1="3.5" y1="0.5" x2="3.5" y2="2.8"/>
              <line x1="8.5" y1="0.5" x2="8.5" y2="2.8"/>
            </svg>
          </button>
          <input
            ref={hiddenStartRef}
            type="date"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none', bottom: 0, right: 0 }}
            onChange={e => {
              if (!e.target.value) return
              const [yyyy, mm, dd] = e.target.value.split('-')
              setStartDraft(`${dd}.${mm}.${yyyy}`)
              const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
              onUpdate({ start: d, end: d > task.end ? d : task.end })
            }}
          />
        </div>
        <span className="task-row__date-sep">→</span>
        <div className="task-row__date-field">
          <input
            type="text"
            className="task-row__date-input"
            title="Due date"
            placeholder="DD.MM.YYYY"
            value={endDraft}
            onChange={e => setEndDraft(e.target.value)}
            onBlur={commitEnd}
          />
          <button
            className="task-row__date-cal"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); hiddenEndRef.current?.showPicker() }}
            aria-label="Open end date calendar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <rect x="0.65" y="1.65" width="10.7" height="9.7" rx="1.2"/>
              <line x1="0.65" y1="4.65" x2="11.35" y2="4.65"/>
              <line x1="3.5" y1="0.5" x2="3.5" y2="2.8"/>
              <line x1="8.5" y1="0.5" x2="8.5" y2="2.8"/>
            </svg>
          </button>
          <input
            ref={hiddenEndRef}
            type="date"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none', bottom: 0, right: 0 }}
            onChange={e => {
              if (!e.target.value) return
              const [yyyy, mm, dd] = e.target.value.split('-')
              setEndDraft(`${dd}.${mm}.${yyyy}`)
              const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
              onUpdate({ end: d, start: d < task.start ? d : task.start })
            }}
          />
        </div>
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
