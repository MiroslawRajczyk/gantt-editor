import { useEffect, useRef, useState } from 'react'
import type { Assignee } from '../types'
import type { TeamMember } from '../lib/clickup'

interface Props {
  members: TeamMember[]
  loading: boolean
  error: string | null
  assigned: Assignee[]
  onToggle: (m: TeamMember) => void
  onClose: () => void
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

export function AssigneePicker({ members, loading, error, assigned, onToggle, onClose }: Props) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', fn), 0)
    return () => document.removeEventListener('mousedown', fn)
  }, [onClose])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const q = search.toLowerCase()
  const filtered = members.filter(
    m => m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
  const assignedIds = new Set(assigned.map(a => a.id))

  return (
    <div ref={ref} className="tdp-picker" onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="tdp-picker-search"
        placeholder="Search people…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="tdp-picker-list">
        {loading && <div className="tdp-picker-empty">Loading…</div>}
        {!loading && error && <div className="tdp-picker-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && <div className="tdp-picker-empty">No results</div>}
        {!loading && !error && filtered.map(m => (
          <button
            key={m.id}
            type="button"
            className={`tdp-picker-item${assignedIds.has(m.id) ? ' is-assigned' : ''}`}
            onClick={() => onToggle(m)}
          >
            <span className="tdp-picker-avatar" style={{ background: avatarColor(m.username) }}>
              {getInitials(m.username)}
            </span>
            <span className="tdp-picker-name">{m.username}</span>
            {assignedIds.has(m.id) && <span className="tdp-picker-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
