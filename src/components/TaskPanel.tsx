import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Filter, GanttTask } from '../types'
import { TaskRow } from './TaskRow'
import { FilterBar } from './FilterBar'
import { GANTT_HEADER_HEIGHT } from '../constants'

interface Props {
  tasks: GanttTask[]
  allTasks: GanttTask[]
  filters: Filter[]
  setFilters: (filters: Filter[]) => void
  matchMode: 'all' | 'any'
  setMatchMode: (mode: 'all' | 'any') => void
  onAdd: () => void
  onClear: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<GanttTask>) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onOpenDetail: (id: string) => void
  listRef: RefObject<HTMLDivElement>
  criticalIds: Set<string>
}

export function TaskPanel({ tasks, allTasks, filters, setFilters, matchMode, setMatchMode, onAdd, onClear, onRemove, onUpdate, onReorder, onOpenDetail, listRef, criticalIds }: Props) {
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
      <div className="task-panel__header" style={{ height: GANTT_HEADER_HEIGHT }}>
        <h2 className="task-panel__title">Tasks</h2>
        <div className="task-panel__header-actions">
          <button className="task-panel__clear-btn" onClick={onClear}>Clear all</button>
          <button className="task-panel__add-btn" onClick={onAdd}>+ Add task</button>
        </div>
      </div>

      <FilterBar
        allTasks={allTasks}
        filters={filters}
        setFilters={setFilters}
        matchMode={matchMode}
        setMatchMode={setMatchMode}
        visibleCount={tasks.length}
      />

      <div className="task-panel__list" ref={listRef}>
        {tasks.length === 0 && (
          <p className="task-panel__empty">
            {filters.length > 0 ? 'No tasks match your filters.' : 'No tasks yet. Add one above.'}
          </p>
        )}
        {tasks.map((task, idx) => (
          <TaskRow
            key={task.id}
            task={task}
            index={idx}
            onUpdate={patch => onUpdate(task.id, patch)}
            onRemove={() => onRemove(task.id)}
            onOpenDetail={() => onOpenDetail(task.id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverIndex === idx}
            isCritical={criticalIds.has(task.id)}
          />
        ))}
      </div>
    </div>
  )
}
