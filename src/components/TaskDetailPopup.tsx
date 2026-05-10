import { useEffect, useRef, useState } from 'react'
import type { Assignee, GanttTask } from '../types'
import { listTeamMembers, type TeamMember } from '../lib/clickup'
import { AssigneePicker } from './AssigneePicker'

interface Props {
  task: GanttTask
  allTasks: GanttTask[]
  onClose: () => void
  onUpdate: (patch: Partial<GanttTask>) => void
  clickupToken?: string
  clickupTeamId?: string
}

const PRIORITIES: Record<number, { label: string; color: string }> = {
  1: { label: 'Urgent', color: '#ef4444' },
  2: { label: 'High', color: '#f59e0b' },
  3: { label: 'Normal', color: '#64748b' },
  4: { label: 'Low', color: '#94a3b8' },
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getInitials(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

function avatarColor(name: string): string {
  const colors = ['#7c85f5', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}

function PriorityPill({ value, onChange }: { value: GanttTask['priority']; onChange: (v: GanttTask['priority']) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    setTimeout(() => document.addEventListener('mousedown', fn), 0)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const p = value ? PRIORITIES[value] : null

  return (
    <div className="tdp-priority-wrap">
      <button
        ref={ref}
        className="tdp-pill"
        style={p ? { color: p.color, borderColor: p.color + '44' } : {}}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        {p ? p.label : 'No priority'}
        <span className="tdp-chev">▾</span>
      </button>
      {open && (
        <div ref={menuRef} className="tdp-menu">
          {([1, 2, 3, 4] as const).map(n => (
            <button
              key={n}
              className={value === n ? 'is-active' : ''}
              onClick={() => { onChange(n); setOpen(false) }}
              type="button"
            >
              <span style={{ color: PRIORITIES[n].color }}>●</span>
              {PRIORITIES[n].label}
            </button>
          ))}
          {value && (
            <>
              <div className="tdp-menu-sep" />
              <button onClick={() => { onChange(undefined); setOpen(false) }} type="button" style={{ color: '#888' }}>
                Clear priority
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function TaskDetailPopup({ task, allTasks, onClose, onUpdate, clickupToken, clickupTeamId }: Props) {
  const [nameDraft, setNameDraft] = useState(task.name)
  const [descDraft, setDescDraft] = useState(task.description ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    setNameDraft(task.name)
    setDescDraft(task.description ?? '')
  }, [task.id, task.name, task.description])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA') onClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const deps = (task.dependencies ?? [])
    .map(id => allTasks.find(t => t.id === id))
    .filter((t): t is GanttTask => !!t)

  const removeDep = (depId: string) => {
    onUpdate({ dependencies: (task.dependencies ?? []).filter(d => d !== depId) })
  }

  const openPicker = async () => {
    setPickerOpen(true)
    if (members.length === 0 && !membersLoading && !fetchError && clickupToken && clickupTeamId) {
      setMembersLoading(true)
      try {
        setMembers(await listTeamMembers(clickupToken, clickupTeamId))
        setFetchError(null)
      } catch (e) {
        setFetchError(String(e))
      } finally {
        setMembersLoading(false)
      }
    }
  }

  const toggleAssignee = (m: TeamMember) => {
    const cur = task.assignees ?? []
    const exists = cur.some(a => a.id === m.id)
    onUpdate({
      assignees: exists
        ? cur.filter(a => a.id !== m.id)
        : [...cur, { id: m.id, username: m.username }],
    })
  }

  const removeAssignee = (a: Assignee) => {
    onUpdate({
      assignees: (task.assignees ?? []).filter(x => x.id !== a.id || x.username !== a.username),
    })
  }

  const clickupUrl = task.clickupId ? `https://app.clickup.com/t/${task.clickupId}` : null

  return (
    <div className="tdp-overlay" onClick={onClose}>
      <div className="tdp-modal" role="dialog" aria-modal="true" aria-label={`Task details: ${task.name}`} onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div className="tdp-topbar">
          <span className="tdp-id">TASK-{task.id.slice(0, 8).toUpperCase()}</span>
          {task.status && (
            <span className="tdp-status-badge">{task.status}</span>
          )}
          <div className="tdp-topbar-spacer" />
          {clickupUrl && (
            <a className="tdp-iconbtn" href={clickupUrl} target="_blank" rel="noreferrer" title="Open in ClickUp">
              ↗
            </a>
          )}
          <button className="tdp-iconbtn tdp-iconbtn--close" onClick={onClose} title="Close (Esc)" type="button">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="tdp-body">

          {/* Hero */}
          <div className="tdp-hero">
            <PriorityPill value={task.priority} onChange={v => onUpdate({ priority: v })} />
            <input
              className="tdp-title"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={() => { const v = nameDraft.trim(); onUpdate({ name: v || task.name }) }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setNameDraft(task.name)
              }}
            />
          </div>

          {/* Properties grid */}
          <div className="tdp-props">

            {/* Assignees */}
            <div className="tdp-label">Assignees</div>
            <div className="tdp-value tdp-assignees-wrap">
              {(task.assignees ?? []).map(a => (
                <span key={a.id !== -1 ? a.id : a.username} className="tdp-assignee-chip">
                  <span className="tdp-av" style={{ background: avatarColor(a.username) }}>
                    {getInitials(a.username)}
                  </span>
                  {a.username}
                  <span
                    className="tdp-assignee-x"
                    onClick={e => { e.stopPropagation(); removeAssignee(a) }}
                    title="Remove assignee"
                  >
                    ×
                  </span>
                </span>
              ))}
              {clickupToken && (
                <button
                  type="button"
                  className="tdp-add-assignee-btn"
                  onClick={e => { e.stopPropagation(); openPicker() }}
                >
                  + Add
                </button>
              )}
              {pickerOpen && (
                <AssigneePicker
                  members={members}
                  loading={membersLoading}
                  error={fetchError}
                  assigned={task.assignees ?? []}
                  onToggle={toggleAssignee}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>

            {/* Dates */}
            <div className="tdp-label">Dates</div>
            <div className="tdp-value">
              <label className="tdp-date-pill">
                <input
                  type="date"
                  value={toDateInput(task.start)}
                  onChange={e => {
                    const d = new Date(e.target.value)
                    if (!isNaN(d.getTime())) onUpdate({ start: d, end: d > task.end ? d : task.end })
                  }}
                />
              </label>
              <span className="tdp-date-arrow">→</span>
              <label className="tdp-date-pill">
                <input
                  type="date"
                  value={toDateInput(task.end)}
                  onChange={e => {
                    const d = new Date(e.target.value)
                    if (!isNaN(d.getTime())) onUpdate({ end: d, start: d < task.start ? d : task.start })
                  }}
                />
              </label>
              <span className="tdp-date-days">
                {Math.max(1, Math.round((task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24)) + 1)} days
              </span>
            </div>

            {/* Dependencies */}
            <div className="tdp-label">Depends on</div>
            <div className="tdp-value">
              {deps.length === 0 && <span className="tdp-empty">—</span>}
              {deps.map(d => (
                <span key={d.id} className="tdp-dep-chip">
                  {d.name}
                  <span className="tdp-dep-x" onClick={() => removeDep(d.id)} title="Remove dependency">×</span>
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="tdp-section">
            <h3>Description</h3>
            <textarea
              className="tdp-desc"
              placeholder="Add a description…"
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              onBlur={() => onUpdate({ description: descDraft })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
