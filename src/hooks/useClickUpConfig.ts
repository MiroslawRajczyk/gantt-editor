import { useState, useEffect } from 'react'
import type { ClickUpConfig } from '../types'

const STORAGE_KEY = 'clickup-config'

function loadFromStorage(): ClickUpConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ClickUpConfig
  } catch {
    // corrupted — ignore
  }
  return null
}

export function useClickUpConfig() {
  const [config, setConfigState] = useState<ClickUpConfig | null>(loadFromStorage)

  useEffect(() => {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    else localStorage.removeItem(STORAGE_KEY)
  }, [config])

  function setConfig(next: ClickUpConfig) {
    setConfigState(next)
  }

  function clearConfig() {
    setConfigState(null)
  }

  return { config, setConfig, clearConfig }
}
