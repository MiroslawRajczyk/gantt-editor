// SECURITY: ClickUp token is held in localStorage — readable by any XSS in this origin.
// Acceptable for personal-tool use. To harden, move to HttpOnly cookie + backend.

import { useEffect, useState } from 'react'
import {
  ClickUpError,
  listFolders,
  listFolderlessLists,
  listLists,
  listSpaces,
  listTeams,
  type Folder,
  type List,
  type Space,
  type Team,
} from '../lib/clickup'
import type { ClickUpConfig } from '../types'

const FOLDERLESS = 'folderless' as const

interface Props {
  open: boolean
  config: ClickUpConfig | null
  onSave: (next: ClickUpConfig) => void
  onClose: () => void
}

export function ClickUpSettings({ open, config, onSave, onClose }: Props) {
  const [token, setToken] = useState('')
  const [teamId, setTeamId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [folder, setFolder] = useState<string | typeof FOLDERLESS>('')
  const [listId, setListId] = useState('')

  const [teams, setTeams] = useState<Team[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderlessLists, setFolderlessLists] = useState<List[]>([])
  const [lists, setLists] = useState<List[]>([])

  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setToken(config?.token ?? '')
    setTeamId(config?.teamId ?? '')
    setSpaceId(config?.spaceId ?? '')
    setFolder(config?.folder ?? '')
    setListId(config?.listId ?? '')
    setTeams([])
    setSpaces([])
    setFolders([])
    setFolderlessLists([])
    setLists([])
    setError(null)
    setLoading(null)
  }, [open, config])

  function handleError(label: string, e: unknown) {
    if (e instanceof ClickUpError) {
      setError(`${label}: ${e.message} (${e.status})`)
    } else {
      setError(`${label}: ${String(e)}`)
    }
  }

  async function loadTeams() {
    if (!token.trim()) {
      setError('Token is required')
      return
    }
    setError(null)
    setLoading('teams')
    try {
      const t = await listTeams(token.trim())
      setTeams(t)
      if (t.length === 1 && !teamId) setTeamId(t[0].id)
    } catch (e) {
      handleError('Load teams', e)
    } finally {
      setLoading(null)
    }
  }

  useEffect(() => {
    if (!teamId) return
    setSpaces([])
    setFolders([])
    setFolderlessLists([])
    setLists([])
    setLoading('spaces')
    setError(null)
    listSpaces(token.trim(), teamId)
      .then(setSpaces)
      .catch(e => handleError('Load spaces', e))
      .finally(() => setLoading(null))
  }, [teamId, token])

  useEffect(() => {
    if (!spaceId) return
    setFolders([])
    setFolderlessLists([])
    setLists([])
    setLoading('folders')
    setError(null)
    Promise.all([
      listFolders(token.trim(), spaceId),
      listFolderlessLists(token.trim(), spaceId),
    ])
      .then(([f, fl]) => {
        setFolders(f)
        setFolderlessLists(fl)
      })
      .catch(e => handleError('Load folders', e))
      .finally(() => setLoading(null))
  }, [spaceId, token])

  useEffect(() => {
    if (!folder) return
    if (folder === FOLDERLESS) {
      setLists(folderlessLists)
      return
    }
    setLists([])
    setLoading('lists')
    setError(null)
    listLists(token.trim(), folder)
      .then(setLists)
      .catch(e => handleError('Load lists', e))
      .finally(() => setLoading(null))
  }, [folder, folderlessLists, token])

  if (!open) return null

  const canSave = !!(token.trim() && teamId && spaceId && folder && listId)

  function handleSave() {
    if (!canSave) return
    onSave({
      token: token.trim(),
      teamId,
      spaceId,
      folder: folder as string | typeof FOLDERLESS,
      listId,
      lastSyncAt: config?.lastSyncAt,
    })
  }

  return (
    <div className="clickup-modal-overlay" onClick={onClose}>
      <div className="clickup-modal" onClick={e => e.stopPropagation()}>
        <h2 className="clickup-modal__title">ClickUp Integration</h2>

        <div className="clickup-modal__row">
          <label htmlFor="cu-token">Personal API Token</label>
          <div className="clickup-modal__token-row">
            <input
              id="cu-token"
              type="password"
              autoComplete="off"
              placeholder="pk_..."
              value={token}
              onChange={e => setToken(e.target.value)}
            />
            <button type="button" onClick={loadTeams} disabled={loading === 'teams'}>
              {loading === 'teams' ? 'Loading…' : 'Load'}
            </button>
          </div>
          <div className="clickup-modal__hint">
            Generate at ClickUp → Settings → Apps → API Token. Stored in browser localStorage.
          </div>
        </div>

        <div className="clickup-modal__row">
          <label htmlFor="cu-team">Workspace</label>
          <select
            id="cu-team"
            value={teamId}
            onChange={e => {
              setTeamId(e.target.value)
              setSpaceId('')
              setFolder('')
              setListId('')
            }}
            disabled={teams.length === 0}
          >
            <option value="">{teams.length ? '— select —' : '(load teams first)'}</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="clickup-modal__row">
          <label htmlFor="cu-space">Space</label>
          <select
            id="cu-space"
            value={spaceId}
            onChange={e => {
              setSpaceId(e.target.value)
              setFolder('')
              setListId('')
            }}
            disabled={spaces.length === 0}
          >
            <option value="">{spaces.length ? '— select —' : '(pick a workspace)'}</option>
            {spaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="clickup-modal__row">
          <label htmlFor="cu-folder">Folder</label>
          <select
            id="cu-folder"
            value={folder}
            onChange={e => {
              setFolder(e.target.value)
              setListId('')
            }}
            disabled={folders.length === 0 && folderlessLists.length === 0}
          >
            <option value="">— select —</option>
            {folderlessLists.length > 0 && (
              <option value={FOLDERLESS}>(folderless lists)</option>
            )}
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="clickup-modal__row">
          <label htmlFor="cu-list">List</label>
          <select
            id="cu-list"
            value={listId}
            onChange={e => setListId(e.target.value)}
            disabled={lists.length === 0}
          >
            <option value="">{lists.length ? '— select —' : '(pick a folder)'}</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="clickup-modal__error">{error}</div>}

        <div className="clickup-modal__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className="clickup-modal__save">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
