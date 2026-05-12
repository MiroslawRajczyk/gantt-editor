import { useEffect, useRef, useState } from 'react'
import type { Tag } from '../types'

interface Props {
  spaceTags: Tag[]
  loading: boolean
  error: string | null
  selected: Tag[]
  onToggle: (tag: Tag) => void
  onCreate: (name: string) => void
  onClose: () => void
}

export function TagPicker({ spaceTags, loading, error, selected, onToggle, onCreate, onClose }: Props) {
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
  const filtered = spaceTags.filter(t => t.name.toLowerCase().includes(q))
  const selectedNames = new Set(selected.map(t => t.name))
  const exactMatch = spaceTags.some(t => t.name.toLowerCase() === q)
  const showCreate = search.trim().length > 0 && !exactMatch

  return (
    <div ref={ref} className="tdp-picker" onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="tdp-picker-search"
        placeholder="Search or create tag…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="tdp-picker-list">
        {loading && <div className="tdp-picker-empty">Loading…</div>}
        {!loading && error && <div className="tdp-picker-error">{error}</div>}
        {!loading && !error && showCreate && (
          <button
            type="button"
            className="tdp-picker-item tdp-picker-create"
            onClick={() => onCreate(search.trim())}
          >
            <span className="tdp-tag-dot" style={{ background: '#888' }} />
            <span className="tdp-picker-name">Create "{search.trim()}"</span>
          </button>
        )}
        {!loading && !error && filtered.length === 0 && !showCreate && (
          <div className="tdp-picker-empty">No tags</div>
        )}
        {!loading && !error && filtered.map(t => (
          <button
            key={t.name}
            type="button"
            className={`tdp-picker-item${selectedNames.has(t.name) ? ' is-assigned' : ''}`}
            onClick={() => onToggle(t)}
          >
            <span className="tdp-tag-dot" style={{ background: t.tag_bg ?? '#888' }} />
            <span className="tdp-picker-name">{t.name}</span>
            {selectedNames.has(t.name) && <span className="tdp-picker-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
