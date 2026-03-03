import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Plus, Trash2, Check, X, Users, ListChecks,
  MessageSquare, Target, Calendar, Clock, FileText, Zap, CheckCircle2,
  Upload, Loader2, AlertTriangle, Eye, Copy, Save, CheckSquare,
  Mic, Radio, Share2, Edit3, StopCircle
} from 'lucide-react'
import {
  meetingsGet, meetingsUpdate, meetingsFinalize, momGenerateFromTranscript,
  meetingsSaveTranscript, momUpdateMarkdown, momSaveRecordingTranscript,
  agendaAdd, agendaUpdate, agendaDelete,
  decisionsAdd, decisionsUpdate, decisionsDelete,
  tasksAdd, tasksUpdate, tasksDelete,
  highlightsAdd, highlightsDelete,
  timelinesAdd, timelinesUpdate, timelinesDelete,
  attendeesAdd, attendeesDelete,
  MeetingDetail, DBTaskRow, DBAgendaRow, DBKeyDecisionRow,
  DBHighlightRow, DBTimelineRow
} from '../../lib/api'

interface MeetingEditorProps {
  meetingId: string
  onBack: () => void
  initialTab?: EditorTab
}

type EditorTab = 'overview' | 'agenda' | 'decisions' | 'tasks' | 'highlights' | 'timelines' | 'recording' | 'transcript' | 'mom'

// ── Small shared components ────────────────────────────────────────────────────

function InlineInput({ value, onSave, className = '' }: {
  value: string; onSave: (v: string) => void; className?: string
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = (): void => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()) }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value); setEditing(true) }} className={`text-left hover:text-indigo-600 ${className}`}>
        {value || <span className="text-gray-300 italic">Click to edit</span>}
      </button>
    )
  }
  return (
    <input
      ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className={`border border-indigo-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    />
  )
}

function AddRow({ placeholder, onAdd, className = '' }: {
  placeholder: string; onAdd: (value: string) => void; className?: string
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [active, setActive] = useState(false)

  const commit = (): void => {
    if (value.trim()) { onAdd(value.trim()); setValue('') }
    setActive(false)
  }

  if (!active) {
    return (
      <button onClick={() => setActive(true)} className={`flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 py-1 ${className}`}>
        <Plus className="w-3.5 h-3.5" /> {placeholder}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false) }}
        placeholder={placeholder}
        className={`flex-1 border border-indigo-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      />
      <button onClick={commit} className="p-1 text-indigo-600 hover:text-indigo-800"><Check className="w-4 h-4" /></button>
      <button onClick={() => setActive(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

function AgendaSection({ meetingId, items, onRefresh }: {
  meetingId: string; items: DBAgendaRow[]; onRefresh: () => void
}): React.JSX.Element {
  const statusOpts: DBAgendaRow['status'][] = ['pending', 'discussed', 'deferred', 'skipped']
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600', discussed: 'bg-emerald-100 text-emerald-700',
    deferred: 'bg-amber-100 text-amber-700', skipped: 'bg-rose-100 text-rose-700',
  }

  const add = async (title: string): Promise<void> => { await agendaAdd(meetingId, title); onRefresh() }
  const remove = async (id: string): Promise<void> => { await agendaDelete(id); onRefresh() }
  const updateStatus = async (id: string, status: string): Promise<void> => { await agendaUpdate(id, { status }); onRefresh() }
  const updateTitle = async (id: string, title: string): Promise<void> => { await agendaUpdate(id, { title }); onRefresh() }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2.5 group hover:border-gray-200">
          <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">{String(i+1).padStart(2,'0')}</span>
          <div className="flex-1 min-w-0">
            <InlineInput value={item.title} onSave={(v) => void updateTitle(item.id, v)} className="text-sm font-medium text-gray-800 w-full" />
            {item.item_code && <span className="text-[10px] font-mono text-indigo-500">{item.item_code}</span>}
          </div>
          <select
            value={item.status}
            onChange={(e) => void updateStatus(item.id, e.target.value)}
            className={`text-xs px-2 py-0.5 rounded-full border-0 font-medium focus:outline-none cursor-pointer ${statusColors[item.status] ?? 'bg-gray-100'}`}
          >
            {statusOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => void remove(item.id)} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <AddRow placeholder="Add agenda item…" onAdd={(v) => void add(v)} />
    </div>
  )
}

function DecisionsSection({ meetingId, items, onRefresh }: {
  meetingId: string; items: DBKeyDecisionRow[]; onRefresh: () => void
}): React.JSX.Element {
  const add = async (decision: string): Promise<void> => { await decisionsAdd(meetingId, { decision }); onRefresh() }
  const remove = async (id: string): Promise<void> => { await decisionsDelete(id); onRefresh() }
  const updateField = async (id: string, field: string, value: string): Promise<void> => { await decisionsUpdate(id, { [field]: value }); onRefresh() }

  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={d.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 group hover:border-gray-200">
          <div className="flex items-start gap-3">
            <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">{String(i+1).padStart(2,'0')}</span>
            <div className="flex-1 min-w-0 space-y-1">
              <InlineInput value={d.decision} onSave={(v) => void updateField(d.id, 'decision', v)} className="text-sm font-medium text-gray-800 w-full" />
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>By: <InlineInput value={d.decided_by ?? ''} onSave={(v) => void updateField(d.id, 'decided_by', v)} className="text-xs" /></span>
                {d.item_code && <span className="font-mono text-indigo-500">{d.item_code}</span>}
              </div>
              {d.impact && <p className="text-xs text-gray-500 italic">Impact: {d.impact}</p>}
            </div>
            <button onClick={() => void remove(d.id)} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      <AddRow placeholder="Add key decision…" onAdd={(v) => void add(v)} />
    </div>
  )
}

interface TaskFormData { title: string; assignedTo: string; assignedToEmail: string; deadline: string; priority: string; description: string }

function TasksSection({ meetingId, items, onRefresh }: {
  meetingId: string; items: DBTaskRow[]; onRefresh: () => void
}): React.JSX.Element {
  const [addingTask, setAddingTask] = useState(false)
  const [form, setForm] = useState<TaskFormData>({ title: '', assignedTo: '', assignedToEmail: '', deadline: '', priority: 'medium', description: '' })
  const [saving, setSaving] = useState(false)

  const priorityColors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700', high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-500',
  }
  const statusColors: Record<string, string> = {
    pending: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700', blocked: 'bg-rose-100 text-rose-700',
  }

  const handleAdd = async (): Promise<void> => {
    if (!form.title.trim() || !form.assignedTo.trim()) return
    setSaving(true)
    try {
      await tasksAdd(meetingId, {
        title: form.title.trim(), assignedTo: form.assignedTo.trim(),
        assignedToEmail: form.assignedToEmail.trim() || undefined,
        deadline: form.deadline || undefined,
        priority: form.priority, description: form.description.trim() || undefined,
      })
      setForm({ title: '', assignedTo: '', assignedToEmail: '', deadline: '', priority: 'medium', description: '' })
      setAddingTask(false)
      onRefresh()
    } finally { setSaving(false) }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this task?')) return
    await tasksDelete(id); onRefresh()
  }

  const updateStatus = async (id: string, status: string): Promise<void> => { await tasksUpdate(id, { status }); onRefresh() }
  const updateTitle = async (id: string, title: string): Promise<void> => { await tasksUpdate(id, { title }); onRefresh() }

  return (
    <div className="space-y-2">
      {items.map((task, i) => {
        const days = task.deadline ? Math.round((new Date(task.deadline).getTime() - Date.now()) / 86400000) : null
        const overdue = days !== null && days < 0 && task.status !== 'completed'
        return (
          <div key={task.id} className={`bg-white border rounded-lg px-3 py-2.5 group hover:border-gray-200 ${overdue ? 'border-rose-200 bg-rose-50/30' : 'border-gray-100'}`}>
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">{String(i+1).padStart(2,'0')}</span>
              <div className="flex-1 min-w-0 space-y-1">
                <InlineInput value={task.title} onSave={(v) => void updateTitle(task.id, v)} className="text-sm font-semibold text-gray-800 w-full" />
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Users className="w-3 h-3" /> {task.assigned_to}
                    {task.assigned_to_email && <span className="text-gray-400">({task.assigned_to_email})</span>}
                  </div>
                  {task.deadline && (
                    <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
                      <Clock className="w-3 h-3" />
                      {new Date(task.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {overdue && ' (overdue)'}
                    </div>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[task.priority] ?? 'bg-gray-100'}`}>{task.priority}</span>
                  {task.item_code && <span className="font-mono text-[10px] text-indigo-500">{task.item_code}</span>}
                </div>
              </div>
              <select
                value={task.status}
                onChange={(e) => void updateStatus(task.id, e.target.value)}
                className={`text-xs px-2 py-0.5 rounded-full border-0 font-medium focus:outline-none cursor-pointer flex-shrink-0 ${statusColors[task.status] ?? 'bg-gray-100'}`}
              >
                {['pending','in_progress','completed','blocked','deferred'].map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
              </select>
              <button onClick={() => void remove(task.id)} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Add task form */}
      {addingTask ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-700">New Action Item</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus placeholder="Task title *" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="col-span-2 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              placeholder="Assigned to *" value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email" placeholder="Email (optional)" value={form.assignedToEmail}
              onChange={(e) => setForm((f) => ({ ...f, assignedToEmail: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="date" value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['critical','high','medium','low'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
            <textarea
              placeholder="Description (optional)" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2} className="col-span-2 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void handleAdd()} disabled={saving || !form.title.trim() || !form.assignedTo.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Task
            </button>
            <button onClick={() => setAddingTask(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingTask(true)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 py-1">
          <Plus className="w-3.5 h-3.5" /> Add action item
        </button>
      )}
    </div>
  )
}

function HighlightsSection({ meetingId, items, onRefresh }: {
  meetingId: string; items: DBHighlightRow[]; onRefresh: () => void
}): React.JSX.Element {
  const typeColors: Record<string, string> = {
    insight: 'bg-indigo-100 text-indigo-700', risk: 'bg-rose-100 text-rose-700',
    opportunity: 'bg-emerald-100 text-emerald-700', concern: 'bg-amber-100 text-amber-700',
    general: 'bg-gray-100 text-gray-600',
  }

  const [addForm, setAddForm] = useState({ text: '', speaker: '', type: 'insight', isKeyPoint: false })
  const [addActive, setAddActive] = useState(false)

  const add = async (): Promise<void> => {
    if (!addForm.text.trim()) return
    await highlightsAdd(meetingId, { text: addForm.text, speaker: addForm.speaker || undefined, type: addForm.type, isKeyPoint: addForm.isKeyPoint })
    setAddForm({ text: '', speaker: '', type: 'insight', isKeyPoint: false })
    setAddActive(false)
    onRefresh()
  }
  const remove = async (id: string): Promise<void> => { await highlightsDelete(id); onRefresh() }

  return (
    <div className="space-y-2">
      {items.map((h, i) => (
        <div key={h.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 group hover:border-gray-200">
          <div className="flex items-start gap-3">
            <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">{String(i+1).padStart(2,'0')}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{h.is_key_point ? '🔑 ' : ''}{h.text}</p>
              <div className="flex items-center gap-2 mt-1">
                {h.speaker && <span className="text-xs text-gray-400">{h.speaker}</span>}
                {h.timestamp && <span className="text-xs text-gray-400">[{h.timestamp}]</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[h.type] ?? 'bg-gray-100'}`}>{h.type}</span>
              </div>
            </div>
            <button onClick={() => void remove(h.id)} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {addActive ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
          <textarea
            autoFocus placeholder="Highlight text *" value={addForm.text}
            onChange={(e) => setAddForm((f) => ({ ...f, text: e.target.value }))}
            rows={2} className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2">
            <input placeholder="Speaker" value={addForm.speaker}
              onChange={(e) => setAddForm((f) => ({ ...f, speaker: e.target.value }))}
              className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
            <select value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none">
              {['insight','risk','opportunity','concern','general'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={addForm.isKeyPoint} onChange={(e) => setAddForm((f) => ({ ...f, isKeyPoint: e.target.checked }))} className="rounded" />
              Key point
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void add()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <button onClick={() => setAddActive(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddActive(true)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 py-1">
          <Plus className="w-3.5 h-3.5" /> Add highlight
        </button>
      )}
    </div>
  )
}

function TimelinesSection({ meetingId, items, onRefresh }: {
  meetingId: string; items: DBTimelineRow[]; onRefresh: () => void
}): React.JSX.Element {
  const [addForm, setAddForm] = useState({ milestone: '', dueDate: '', owner: '' })
  const [addActive, setAddActive] = useState(false)
  const statusColors: Record<string, string> = {
    on_track: 'bg-emerald-100 text-emerald-700', at_risk: 'bg-amber-100 text-amber-700',
    delayed: 'bg-rose-100 text-rose-700', completed: 'bg-indigo-100 text-indigo-700',
  }

  const add = async (): Promise<void> => {
    if (!addForm.milestone.trim() || !addForm.dueDate || !addForm.owner.trim()) return
    await timelinesAdd(meetingId, { milestone: addForm.milestone, dueDate: addForm.dueDate, owner: addForm.owner })
    setAddForm({ milestone: '', dueDate: '', owner: '' }); setAddActive(false); onRefresh()
  }
  const remove = async (id: string): Promise<void> => { await timelinesDelete(id); onRefresh() }
  const updateStatus = async (id: string, status: string): Promise<void> => { await timelinesUpdate(id, { status }); onRefresh() }

  return (
    <div className="space-y-2">
      {items.map((tl, i) => (
        <div key={tl.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 group hover:border-gray-200">
          <div className="flex items-start gap-3">
            <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">{String(i+1).padStart(2,'0')}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{tl.milestone}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tl.owner}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(tl.due_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
                {tl.item_code && <span className="font-mono text-indigo-500">{tl.item_code}</span>}
              </div>
            </div>
            <select value={tl.status} onChange={(e) => void updateStatus(tl.id, e.target.value)}
              className={`text-xs px-2 py-0.5 rounded-full border-0 font-medium focus:outline-none cursor-pointer flex-shrink-0 ${statusColors[tl.status] ?? 'bg-gray-100'}`}>
              {['on_track','at_risk','delayed','completed'].map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
            <button onClick={() => void remove(tl.id)} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {addActive ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input autoFocus placeholder="Milestone *" value={addForm.milestone}
              onChange={(e) => setAddForm((f) => ({ ...f, milestone: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
            <input placeholder="Owner *" value={addForm.owner}
              onChange={(e) => setAddForm((f) => ({ ...f, owner: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
            <input type="date" value={addForm.dueDate}
              onChange={(e) => setAddForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void add()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <button onClick={() => setAddActive(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddActive(true)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 py-1">
          <Plus className="w-3.5 h-3.5" /> Add milestone
        </button>
      )}
    </div>
  )
}

// ── Recording Section ─────────────────────────────────────────────────────────

// SpeechRecognition is built into Chromium (Electron). No extra binary needed.
declare class SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}

function RecordingSection({ meetingId, onRefresh }: {
  meetingId: string; onRefresh: () => void
}): React.JSX.Element {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [liveText, setLiveText] = useState('')
  const [finalText, setFinalText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<{ taskCount: number; agendaCount: number; decisionCount: number } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [lang, setLang] = useState<'en-IN' | 'hi-IN'>('hi-IN')  // hi-IN handles Hindi + Hinglish + English

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finalTextRef = useRef('')
  const isRecordingRef = useRef(false)

  useEffect(() => { finalTextRef.current = finalText }, [finalText])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  const startRecognition = (SR: typeof SpeechRecognition, selectedLang: string): void => {
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLang

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let newFinal = finalTextRef.current
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          newFinal += result[0].transcript + ' '
        } else {
          interim += result[0].transcript
        }
      }
      setFinalText(newFinal)
      setLiveText(interim)
    }

    recognition.onerror = (e: { error: string }) => {
      // 'no-speech' and 'aborted' are normal — engine auto-restarts
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Open System Preferences → Privacy & Security → Microphone and allow MOM Pro, then restart the app.')
        stopRecording()
      } else if (e.error === 'audio-capture') {
        setError('No microphone found. Please connect a microphone and try again.')
        stopRecording()
      }
      // no-speech / aborted / network: let onend handle restart
    }

    recognition.onend = () => {
      // Auto-restart to keep recording continuously without pauses
      if (isRecordingRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && recognitionRef.current) {
            try { recognitionRef.current.start() } catch { /* ignore */ }
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const startRecording = async (): Promise<void> => {
    setError('')
    setGenResult(null)

    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition

    if (!SR) {
      setError('Speech recognition not supported. Use the Transcript tab to paste text manually.')
      return
    }

    // Step 1: Request macOS system-level mic permission via main process IPC.
    // If denied/restricted, main process opens System Preferences automatically.
    try {
      const permResult = await (window.electron.ipcRenderer as { invoke: (ch: string) => Promise<{ granted: boolean; openedPrefs?: boolean }> }).invoke('mic:request-permission')
      if (permResult.openedPrefs === true) {
        setError('System Preferences opened — grant microphone access to MOM Pro, then click Retry.')
        return
      }
    } catch { /* ignore — non-critical, proceed */ }

    // Step 2: Prime getUserMedia to force Chromium device enumeration.
    // In Electron, webkitSpeechRecognition cannot request mic permission on its own —
    // it silently gets 'not-allowed'. getUserMedia forces the permission dialog first.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())  // release immediately — just needed the grant
    } catch (permErr) {
      const err = permErr as DOMException
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        // Open System Preferences automatically via main process
        await (window.electron.ipcRenderer as { invoke: (ch: string) => Promise<unknown> }).invoke('mic:request-permission')
        setError('System Preferences opened — grant microphone access, then click Retry.')
        return
      } else if (err.name === 'NotFoundError') {
        // Mac Mini has no built-in mic — getUserMedia may fail even when an external
        // mic (AirPods, USB) IS connected, because macOS hides device enumeration
        // until Chromium permission propagates. Proceed: SpeechRecognition has its
        // own audio path and will succeed or fail with its own onerror callback.
        console.warn('[MOM Pro] getUserMedia NotFoundError — proceeding with SpeechRecognition anyway')
      } else {
        console.warn('[MOM Pro] getUserMedia error (continuing):', err.message)
        // Don't block on unknown device errors — let SpeechRecognition attempt
      }
    }

    setIsRecording(true)
    isRecordingRef.current = true
    startRecognition(SR, lang)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }

  const stopRecording = (): void => {
    isRecordingRef.current = false
    if (recognitionRef.current) {
      const r = recognitionRef.current
      recognitionRef.current = null
      try { r.stop() } catch { /* ignore */ }
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setLiveText('')
    setIsRecording(false)
  }

  const handleSave = async (): Promise<void> => {
    const full = finalText.trim()
    if (!full) return
    await momSaveRecordingTranscript(meetingId, full)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handleGenerate = async (): Promise<void> => {
    const full = finalText.trim()
    if (!full) { setError('No transcript yet. Start recording first.'); return }
    setGenerating(true); setError('')
    try {
      await momSaveRecordingTranscript(meetingId, full)
      const result = await momGenerateFromTranscript(meetingId, full)
      setGenResult({ taskCount: result.taskCount, agendaCount: result.agendaCount, decisionCount: result.decisionCount })
      onRefresh()
    } catch (e) {
      setError(`AI generation failed: ${String(e)}`)
    } finally { setGenerating(false) }
  }

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const wordCount = finalText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Radio className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800">Live Voice Recording & Transcription</p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Uses your microphone + built-in speech recognition. Press Start to begin — transcription appears live.
              Stop when done, then Generate MOM to let AI extract decisions, tasks, and timelines.
            </p>
          </div>
        </div>
      </div>

      {/* Language selector + Start / Stop controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        {/* Language selector — only when not recording */}
        {!isRecording && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-gray-500">Language:</span>
            {([
              { value: 'hi-IN', label: 'Hindi / Hinglish', hint: 'हिंदी + English mix' },
              { value: 'en-IN', label: 'English only',     hint: 'English (India)' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLang(opt.value)}
                title={opt.hint}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  lang === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isRecording && (
              <span className="flex items-center gap-1.5 text-rose-600 text-sm font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                REC {formatTime(elapsed)} · {lang === 'hi-IN' ? 'Hindi/Hinglish' : 'English'}
              </span>
            )}
            {!isRecording && elapsed > 0 && (
              <span className="text-sm text-gray-500">Stopped · {formatTime(elapsed)} recorded</span>
            )}
            {!isRecording && elapsed === 0 && (
              <span className="text-sm text-gray-400">Ready to record</span>
            )}
          </div>
          <div className="flex gap-2">
            {!isRecording ? (
              <button
                onClick={() => void startRecording()}
                className="flex items-center gap-2 bg-rose-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors text-sm"
              >
                <Mic className="w-4 h-4" /> Start Meeting
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 bg-gray-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors text-sm"
              >
                <StopCircle className="w-4 h-4" /> Stop Meeting
              </button>
            )}
          </div>
        </div>

        {/* Live interim text — always visible while recording */}
        {isRecording && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 min-h-[56px]">
            <p className="text-[10px] text-rose-400 font-bold mb-1 uppercase tracking-wider">● Live Transcript</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {liveText
                ? <span className="text-rose-700 italic">{liveText}</span>
                : <span className="text-gray-400 italic">Listening… speak clearly into your microphone</span>
              }
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Gen result */}
      {genResult && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            Generated: {genResult.agendaCount} agenda, {genResult.decisionCount} decisions, {genResult.taskCount} tasks. Check each tab.
          </p>
        </div>
      )}

      {/* Full transcript text */}
      {(finalText || !isRecording) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">
              Transcript {wordCount > 0 ? `— ${wordCount} words` : ''}
            </label>
            <button
              onClick={() => void handleSave()}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors ${saved ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save Transcript</>}
            </button>
          </div>
          <textarea
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            placeholder="Recording transcript will appear here as you speak…&#10;You can also type or paste corrections."
            rows={12}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
      )}

      {/* Generate MOM */}
      {finalText.trim().length > 20 && (
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40"
        >
          {generating ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating MOM with AI…</>
          ) : (
            <><Zap className="w-5 h-5" /> Generate MOM with AI</>
          )}
        </button>
      )}
    </div>
  )
}

// ── Transcript Section ─────────────────────────────────────────────────────────

function TranscriptSection({ meetingId, detail, onRefresh }: {
  meetingId: string; detail: MeetingDetail; onRefresh: () => void
}): React.JSX.Element {
  const [transcript, setTranscript] = useState(detail.meeting.transcript ?? '')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<{ taskCount: number; agendaCount: number; decisionCount: number } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = async (): Promise<void> => {
    await meetingsSaveTranscript(meetingId, transcript, 'manual')
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handleGenerate = async (): Promise<void> => {
    if (!transcript.trim()) { setError('Paste the meeting transcript first'); return }
    setGenerating(true); setError('')
    try {
      const result = await momGenerateFromTranscript(meetingId, transcript)
      setGenResult({ taskCount: result.taskCount, agendaCount: result.agendaCount, decisionCount: result.decisionCount })
      onRefresh()
    } catch (e) {
      setError(`AI generation failed: ${String(e)}`)
    } finally { setGenerating(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Zap className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800">AI MOM Generation via qwen2.5:3b</p>
            <p className="text-xs text-indigo-600 mt-0.5">Paste your meeting transcript below, then click Generate MOM. The AI will extract agenda, decisions, tasks, highlights, and timelines automatically.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {genResult && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            Generated: {genResult.agendaCount} agenda items, {genResult.decisionCount} decisions, {genResult.taskCount} tasks.
            {' '}Check each tab to review and edit.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-600">Meeting Transcript</label>
          <button onClick={() => void handleSave()} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors ${saved ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:bg-gray-100'}`}>
            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </button>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste your meeting transcript here…&#10;&#10;Example:&#10;[10:00] Rahul: Let's start with the Q1 review...&#10;[10:05] Priya: We need to finalize the vendor contracts by next week..."
          rows={14}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">{transcript.length} characters · {transcript.trim().split(/\s+/).filter(Boolean).length} words</p>
      </div>

      <button
        onClick={() => void handleGenerate()} disabled={generating || !transcript.trim()}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {generating ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Generating with qwen2.5:3b…</>
        ) : (
          <><Zap className="w-5 h-5" /> Generate MOM with AI</>
        )}
      </button>
      <p className="text-xs text-center text-gray-400">Existing content won't be overwritten if already present</p>
    </div>
  )
}

// ── MOM Preview Section (editable) ────────────────────────────────────────────

function MOMPreview({ detail, onRefresh }: { detail: MeetingDetail; onRefresh: () => void }): React.JSX.Element {
  const initialMd = detail.momDocument?.generated_markdown ?? ''
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(initialMd)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(false)

  // Sync when parent re-fetches
  useEffect(() => { setDraft(detail.momDocument?.generated_markdown ?? '') }, [detail.momDocument?.generated_markdown])

  const copyMarkdown = (): void => {
    if (draft) { void navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await momUpdateMarkdown(detail.meeting.id, draft)
      setSaveDone(true); setTimeout(() => setSaveDone(false), 2000)
      setEditMode(false)
      onRefresh()
    } finally { setSaving(false) }
  }

  const handleShare = (): void => {
    const subject = encodeURIComponent(`Minutes of Meeting — ${detail.meeting.title}`)
    const body = encodeURIComponent(draft || 'No MOM content yet.')
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  if (!initialMd && !editMode) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <FileText className="w-12 h-12 text-gray-200" />
        <p className="text-sm text-gray-500 font-medium">No MOM document yet</p>
        <p className="text-xs text-gray-400 mb-3">Generate MOM via the Recording or Transcript tab, or finalize via the header button.</p>
        <button
          onClick={() => setEditMode(true)}
          className="flex items-center gap-2 text-sm text-indigo-600 border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
          <Edit3 className="w-4 h-4" /> Write MOM manually
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-800">Minutes of Meeting</span>
          {detail.momDocument?.finalized_at && (
            <p className="text-xs text-gray-400 mt-0.5">
              Finalized {new Date(detail.momDocument.finalized_at).toLocaleString('en-IN')} · by {detail.momDocument.finalized_by ?? '—'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveDone && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
          {!editMode ? (
            <>
              <button
                onClick={() => { setDraft(detail.momDocument?.generated_markdown ?? ''); setEditMode(true) }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit MOM
              </button>
              <button
                onClick={copyMarkdown}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share via Email
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setDraft(detail.momDocument?.generated_markdown ?? ''); setEditMode(false) }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save MOM
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      {editMode ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Edit the MOM content below. Use Markdown formatting for headers, lists, and bold text.</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={28}
            className="w-full border border-indigo-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto max-h-[65vh]">
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{draft}</pre>
        </div>
      )}
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────────────────

export function MeetingEditor({ meetingId, onBack, initialTab }: MeetingEditorProps): React.JSX.Element {
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<EditorTab>(initialTab ?? 'overview')
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeResult, setFinalizeResult] = useState<{ meetingCode: string; alertsActivated: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await meetingsGet(meetingId)
      setDetail(d)
    } finally { setLoading(false) }
  }, [meetingId])

  useEffect(() => { void load() }, [load])

  const refresh = useCallback(() => { void load() }, [load])

  const handleFinalize = async (): Promise<void> => {
    if (!detail) return
    if (!window.confirm('Finalize this meeting? This will assign meeting codes to all items and activate alert chains. This action cannot be undone.')) return
    setFinalizing(true)
    try {
      const result = await meetingsFinalize(meetingId)
      setFinalizeResult(result)
      await load()
    } catch (e) {
      window.alert(`Finalize failed: ${String(e)}`)
    } finally { setFinalizing(false) }
  }

  const handleTitleSave = async (title: string): Promise<void> => {
    setSaving(true)
    try { await meetingsUpdate(meetingId, { title }); await load() } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle className="w-10 h-10 text-rose-400" />
        <p className="text-sm text-gray-600">Meeting not found</p>
        <button onClick={onBack} className="text-sm text-indigo-600 underline">Go back</button>
      </div>
    )
  }

  const m = detail.meeting
  const isFinalized = !!m.meeting_code

  const TABS: { id: EditorTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview',    label: 'Overview',    icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'agenda',      label: 'Agenda',      icon: <ListChecks className="w-3.5 h-3.5" />, count: detail.agendaItems.length },
    { id: 'decisions',   label: 'Decisions',   icon: <Target className="w-3.5 h-3.5" />,    count: detail.keyDecisions.length },
    { id: 'tasks',       label: 'Tasks',       icon: <CheckSquare className="w-3.5 h-3.5" />, count: detail.tasks.length },
    { id: 'highlights',  label: 'Highlights',  icon: <MessageSquare className="w-3.5 h-3.5" />, count: detail.highlights.length },
    { id: 'timelines',   label: 'Timelines',   icon: <Calendar className="w-3.5 h-3.5" />,  count: detail.timelines.length },
    { id: 'recording',   label: 'Record',      icon: <Mic className="w-3.5 h-3.5" /> },
    { id: 'transcript',  label: 'Transcript',  icon: <Upload className="w-3.5 h-3.5" /> },
    { id: 'mom',         label: 'MOM',         icon: <FileText className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <InlineInput
              value={m.title}
              onSave={(v) => void handleTitleSave(v)}
              className="text-base font-bold text-gray-900 w-full"
            />
            <div className="flex items-center gap-2 mt-0.5">
              {isFinalized && (
                <span className="font-mono text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">{m.meeting_code}</span>
              )}
              <span className="text-xs text-gray-400">
                {new Date(m.scheduled_start).toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${m.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {m.status}
              </span>
              {saving && <span className="text-xs text-gray-400 animate-pulse">saving…</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {finalizeResult && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium">
                ✓ {finalizeResult.meetingCode} · {finalizeResult.alertsActivated} alerts
              </span>
            )}
            {!isFinalized && (
              <button
                onClick={() => void handleFinalize()} disabled={finalizing}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                {finalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Finalize MOM
              </button>
            )}
            {isFinalized && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Finalized
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-gray-100 text-gray-600 text-[9px] px-1 rounded-full font-bold ml-0.5">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="max-w-2xl mx-auto space-y-4">

            {/* Workflow guide banner */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs font-bold text-indigo-800 mb-2 uppercase tracking-wide">Meeting Workflow</p>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { step: '1', icon: <Mic className="w-3 h-3" />, label: 'Record', tab: 'recording', color: 'bg-rose-500' },
                  { step: '→', icon: null, label: null, tab: null, color: '' },
                  { step: '2', icon: <Upload className="w-3 h-3" />, label: 'Transcript', tab: 'transcript', color: 'bg-blue-500' },
                  { step: '→', icon: null, label: null, tab: null, color: '' },
                  { step: '3', icon: <Zap className="w-3 h-3" />, label: 'Generate MOM (AI)', tab: 'transcript', color: 'bg-indigo-500' },
                  { step: '→', icon: null, label: null, tab: null, color: '' },
                  { step: '4', icon: <Edit3 className="w-3 h-3" />, label: 'Edit MOM', tab: 'mom', color: 'bg-purple-500' },
                  { step: '→', icon: null, label: null, tab: null, color: '' },
                  { step: '5', icon: <Share2 className="w-3 h-3" />, label: 'Share', tab: 'mom', color: 'bg-emerald-500' },
                ].map((item, i) => (
                  item.label ? (
                    <button
                      key={i}
                      onClick={() => item.tab && setTab(item.tab as EditorTab)}
                      className={`flex items-center gap-1.5 text-white text-xs font-semibold px-2.5 py-1 rounded-full ${item.color} hover:opacity-90 transition-opacity`}
                    >
                      {item.icon} {item.label}
                    </button>
                  ) : (
                    <span key={i} className="text-gray-400 text-xs">→</span>
                  )
                ))}
              </div>
              <p className="text-xs text-indigo-600 mt-2">
                Click any step to navigate. Use the <strong>Record</strong> tab for live mic recording, or <strong>Transcript</strong> to paste text and generate MOM with AI.
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Meeting Details</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><span className="text-xs text-gray-400 block">Date</span>{new Date(m.scheduled_start).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}</div>
                <div><span className="text-xs text-gray-400 block">Mode</span><span className="capitalize">{m.mode}</span>{m.location ? ` · ${m.location}` : ''}</div>
                <div><span className="text-xs text-gray-400 block">Organizer</span>{m.organizer ?? '—'}</div>
                <div><span className="text-xs text-gray-400 block">Model</span><span className="font-mono text-indigo-600">{m.llm_model}</span></div>
              </div>
              {m.notes && <div><span className="text-xs text-gray-400 block mb-1">Notes</span><p className="text-sm text-gray-600">{m.notes}</p></div>}
            </div>

            {/* Attendees */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Attendees ({detail.attendees.length})</h3>
              </div>
              <div className="space-y-2">
                {detail.attendees.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 group">
                    <div className="w-7 h-7 bg-indigo-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-indigo-700">{a.name[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{a.name}</p>
                      {(a.email || a.role) && (
                        <p className="text-xs text-gray-400">{[a.role, a.email].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <button onClick={() => { void attendeesDelete(a.id).then(() => load()) }} className="p-1 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <AddAttendeeInline meetingId={meetingId} onAdded={refresh} />
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Agenda', value: detail.agendaItems.length, color: 'bg-indigo-50 text-indigo-700' },
                { label: 'Decisions', value: detail.keyDecisions.length, color: 'bg-purple-50 text-purple-700' },
                { label: 'Tasks', value: detail.tasks.length, color: 'bg-amber-50 text-amber-700' },
                { label: 'Timelines', value: detail.timelines.length, color: 'bg-emerald-50 text-emerald-700' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs font-medium opacity-70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'agenda' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Agenda Items</h2>
            <AgendaSection meetingId={meetingId} items={detail.agendaItems} onRefresh={refresh} />
          </div>
        )}

        {tab === 'decisions' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Key Decisions</h2>
            <DecisionsSection meetingId={meetingId} items={detail.keyDecisions} onRefresh={refresh} />
          </div>
        )}

        {tab === 'tasks' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Action Items</h2>
            <TasksSection meetingId={meetingId} items={detail.tasks} onRefresh={refresh} />
          </div>
        )}

        {tab === 'highlights' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Highlights & Insights</h2>
            <HighlightsSection meetingId={meetingId} items={detail.highlights} onRefresh={refresh} />
          </div>
        )}

        {tab === 'timelines' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Timelines & Milestones</h2>
            <TimelinesSection meetingId={meetingId} items={detail.timelines} onRefresh={refresh} />
          </div>
        )}

        {tab === 'recording' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Live Recording & Transcription</h2>
            <RecordingSection meetingId={meetingId} onRefresh={refresh} />
          </div>
        )}

        {tab === 'transcript' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Transcript & AI Generation</h2>
            <TranscriptSection meetingId={meetingId} detail={detail} onRefresh={refresh} />
          </div>
        )}

        {tab === 'mom' && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Minutes of Meeting (MOM)</h2>
            <MOMPreview detail={detail} onRefresh={refresh} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add Attendee Inline ────────────────────────────────────────────────────────

function AddAttendeeInline({ meetingId, onAdded }: { meetingId: string; onAdded: () => void }): React.JSX.Element {
  const [active, setActive] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await attendeesAdd(meetingId, { name: name.trim(), email: email.trim() || undefined, role: role.trim() || undefined })
      setName(''); setEmail(''); setRole(''); setActive(false); onAdded()
    } finally { setSaving(false) }
  }

  if (!active) {
    return (
      <button onClick={() => setActive(true)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600">
        <Plus className="w-3.5 h-3.5" /> Add attendee
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <input autoFocus placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setActive(false) }}
        className="flex-1 border border-indigo-300 rounded px-2 py-1 text-xs focus:outline-none" />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
        className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" />
      <input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)}
        className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" />
      <button onClick={() => void add()} disabled={saving || !name.trim()}
        className="p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button onClick={() => setActive(false)} className="p-1 text-gray-400"><X className="w-4 h-4" /></button>
    </div>
  )
}

