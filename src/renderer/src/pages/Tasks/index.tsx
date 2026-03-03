import React, { useState, useEffect, useCallback } from 'react'
import { CheckSquare, Search, AlertCircle, Clock, User, RefreshCw, Plus, X, Send } from 'lucide-react'
import { tasksList, tasksUpdate, tasksCreateManual, DBTaskRow } from '../../lib/api'

interface TasksPageProps {
  onOpenMeeting?: (id: string) => void
}

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'deferred' | 'cancelled'

const COLUMNS: { id: TaskStatus; label: string; color: string; dot: string }[] = [
  { id: 'pending',     label: 'Open',       color: 'bg-blue-500',    dot: 'bg-blue-400'    },
  { id: 'in_progress', label: 'In Progress', color: 'bg-amber-500',   dot: 'bg-amber-400'   },
  { id: 'blocked',     label: 'Blocked',     color: 'bg-rose-500',    dot: 'bg-rose-400'    },
  { id: 'completed',   label: 'Done',        color: 'bg-emerald-500', dot: 'bg-emerald-400' },
]

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
}

interface CreateTaskForm {
  title: string
  assignedTo: string
  assignedToEmail: string
  deadline: string
  priority: string
  description: string
}

const EMPTY_FORM: CreateTaskForm = {
  title: '', assignedTo: '', assignedToEmail: '',
  deadline: '', priority: 'medium', description: '',
}

export function TasksPage({ onOpenMeeting }: TasksPageProps): React.JSX.Element {
  const [tasks, setTasks] = useState<DBTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)

  // Create task modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateTaskForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await tasksList({ search: search || undefined })
      setTasks(all)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 200)
    return () => clearTimeout(t)
  }, [load])

  const getColumnTasks = (status: TaskStatus): DBTaskRow[] =>
    tasks.filter((t) => t.status === status)

  const moveTask = async (taskId: string, newStatus: TaskStatus): Promise<void> => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))
    try {
      await tasksUpdate(taskId, { status: newStatus })
    } catch {
      void load()
    }
  }

  const handleCreateTask = async (): Promise<void> => {
    if (!form.title.trim() || !form.assignedTo.trim()) {
      setCreateError('Task title and assignee are required.')
      return
    }
    setCreateError(''); setCreating(true)
    try {
      const newTask = await tasksCreateManual({
        title: form.title.trim(),
        assignedTo: form.assignedTo.trim(),
        assignedToEmail: form.assignedToEmail.trim() || undefined,
        deadline: form.deadline || undefined,
        priority: form.priority,
        description: form.description.trim() || undefined,
      })
      setTasks((prev) => [newTask, ...prev])
      setShowCreate(false)
      setForm(EMPTY_FORM)
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const daysUntil = (iso: string | null): number | null => {
    if (!iso) return null
    const now = new Date(); now.setHours(0,0,0,0)
    const d = new Date(iso); d.setHours(0,0,0,0)
    return Math.round((d.getTime() - now.getTime()) / 86400000)
  }

  const deadlineLabel = (iso: string | null): React.JSX.Element | null => {
    const days = daysUntil(iso)
    if (days === null) return null
    const color = days < 0 ? 'text-rose-600 font-bold' : days === 0 ? 'text-rose-500 font-bold' : days <= 2 ? 'text-amber-600' : 'text-gray-400'
    const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`
    return (
      <span className={`text-[10px] flex items-center gap-0.5 ${color}`}>
        <Clock className="w-3 h-3" /> {label}
      </span>
    )
  }

  // Drag-and-drop
  const onDragStart = (e: React.DragEvent, taskId: string): void => {
    e.dataTransfer.setData('taskId', taskId)
    setDragging(taskId)
  }
  const onDragEnd = (): void => setDragging(null)
  const onDragOver = (e: React.DragEvent): void => { e.preventDefault() }
  const onDrop = (e: React.DragEvent, status: TaskStatus): void => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId && taskId !== tasks.find((t) => t.id === taskId && t.status === status)?.id) {
      void moveTask(taskId, status)
    }
    setDragging(null)
  }

  const totalOpen = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length
  const totalOverdue = tasks.filter((t) => {
    if (!t.deadline || t.status === 'completed') return false
    return new Date(t.deadline) < new Date()
  }).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-600" /> Task Board
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalOpen} open · {totalOverdue > 0 && <span className="text-rose-500 font-semibold">{totalOverdue} overdue · </span>}
            {tasks.filter((t) => t.status === 'completed').length} done — drag cards to move
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowCreate(true); setCreateError(''); setForm(EMPTY_FORM) }}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create Task
          </button>
          <button onClick={() => { void load() }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-2.5 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, assignees, codes…"
            className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-4 p-4" style={{ minWidth: COLUMNS.length * 260 }}>
          {COLUMNS.map((col) => {
            const colTasks = getColumnTasks(col.id)
            return (
              <div
                key={col.id}
                className="flex flex-col flex-1 min-w-[230px] bg-white rounded-xl border border-gray-200 overflow-hidden"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {loading && colTasks.length === 0 ? (
                    <div className="text-center py-6 text-gray-300 text-xs">Loading…</div>
                  ) : colTasks.length === 0 ? (
                    <div className="text-center py-6 text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-lg">
                      Drop tasks here
                    </div>
                  ) : colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                      className={`bg-gray-50 border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all ${
                        dragging === task.id ? 'opacity-40 scale-95' : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Code + deadline */}
                      <div className="flex items-center justify-between mb-1.5">
                        {task.item_code ? (
                          <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {task.item_code.split('/')[1] ?? task.item_code}
                          </span>
                        ) : task.is_manual ? (
                          <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100">manual</span>
                        ) : (
                          <span className="text-[10px] text-gray-300 italic">no code</span>
                        )}
                        {deadlineLabel(task.deadline)}
                      </div>

                      {/* Title */}
                      <p className="text-xs font-semibold text-gray-800 leading-snug mb-2">{task.title}</p>

                      {/* Assignee + priority */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-4 h-4 bg-indigo-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-indigo-700">{task.assigned_to[0]?.toUpperCase() ?? '?'}</span>
                          </div>
                          <span className="text-[11px] text-gray-500 truncate">{task.assigned_to}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                          {task.priority}
                        </span>
                      </div>

                      {/* Overdue indicator */}
                      {task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed' && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-rose-500">
                          <AlertCircle className="w-3 h-3" /> Overdue
                        </div>
                      )}

                      {/* Quick status move buttons */}
                      <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                        {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => void moveTask(task.id, c.id)}
                            className="flex-1 text-[9px] py-0.5 px-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>

                      {/* Open meeting link */}
                      {onOpenMeeting && task.meeting_id && task.meeting_id !== 'manual-standalone' && (
                        <button
                          onClick={() => onOpenMeeting(task.meeting_id)}
                          className="mt-1.5 w-full text-[9px] text-indigo-400 hover:text-indigo-600 text-left flex items-center gap-0.5"
                        >
                          <User className="w-2.5 h-2.5" /> {task.meeting_code || 'Open meeting'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" /> Create Task
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Task Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Prepare Q1 budget report"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              {/* Assigned to + email in same row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Assigned To *</label>
                  <input
                    type="text"
                    value={form.assignedTo}
                    onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                    placeholder="Name"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={form.assignedToEmail}
                    onChange={(e) => setForm((f) => ({ ...f, assignedToEmail: e.target.value }))}
                    placeholder="email@company.com"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Deadline + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Additional context or notes…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {createError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{createError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="text-sm text-gray-500 border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateTask()}
                disabled={creating || !form.title.trim() || !form.assignedTo.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {creating ? (
                  <span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating…</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Create Task</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
