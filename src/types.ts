export interface GanttTask {
  id: string
  name: string
  start: Date
  end: Date
  progress: number
  dependencies?: string[]
  clickupId?: string
}

export interface ClickUpConfig {
  token: string
  teamId: string
  spaceId: string
  folder: string | 'folderless'
  listId: string
  lastSyncAt?: string
}

export interface SyncReport {
  added: number
  updatedFromRemote: number
  pushedToRemote: number
  deletedLocal: number
  createdRemote: number
  depsAdded: number
  depsAddedFromRemote: number
  errors: string[]
  durationMs: number
}
