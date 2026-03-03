import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText, Plus, Search, Filter, X, ChevronDown,
  Calendar, MapPin, Users, Trash2, Eye, CheckCircle,
  Mic, ArrowRight, FileOutput, Edit3, Share2
} from 'lucide-react'
import { meetingsList, meetingsCreate, meetingsDelete, DBMeetingRow } from '../../lib/api'

interface MeetingsPageProps {
  onOpenMeeting: (id: string, tab?: string) => void
}

// ── New Meeting Modal ──────────────────────────────────────────────────────────

interface AttendeeEntry { name: string; email: string; role: string }

function NewMeetingModal({
  onClose, onCreated
}: { onClose: () => void; onCreated: (id: string) => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [mode, setMode] = useState('in-person')
  const [location, setLocation] = useState('')
  const [organizer, setOrganizer] = useState('')
  const [notes, setNotes] = useState('')
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([{ name: '', email: '', role: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addAttendee = (): void => setAttendees((prev) => [...prev, { name: '', email: '', role: '' }])
  const removeAttendee = (i: number): void => setAttendees((prev) => prev.filter((_, idx) => idx !== i))
  const updateAttendee = (i: number, field: keyof AttendeeEntry, value: string): void => {
    setAttendees((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!scheduledStart) { setError('Start date/time is required'); return }
    setSaving(true); setError('')
    try {
      const validAttendees = attendees.filter((a) => a.name.trim())
      const result = await meetingsCreate({
        title: title.trim(),
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : undefined,
        mode,
        location: location.trim() || undefined,
        organizer: organizer.trim() || undefined,
        notes: notes.trim() || undefined,
        attendees: validAttendees.map((a) => ({
          name: a.name.trim(), email: a.email.trim() || undefined, role: a.role.trim() || undefined
        })),
      })
      onCreated(result.meeting.id)
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Meeting</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Meeting Title *</label>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q1 Strategy Planning, Weekly Ops Sync…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            {/* Date/Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date & Time *</label>
                <input
                  type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">End Date & Time</label>
                <input
                  type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Mode + Location row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Meeting Mode</label>
                <div className="relative">
                  <select
                    value={mode} onChange={(e) => setMode(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8"
                  >
                    <option value="in-person">In-Person</option>
                    <option value="virtual">Virtual</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Location / Link</label>
                <input
                  type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Conference Room A or Meet link"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Organizer */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Organizer Name</label>
              <input
                type="text" value={organizer} onChange={(e) => setOrganizer(e.target.value)}
                placeholder="Meeting organized by…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Attendees */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600">Attendees</label>
                <button type="button" onClick={addAttendee} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Attendee
                </button>
              </div>
              <div className="space-y-2">
                {attendees.map((att, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text" value={att.name} onChange={(e) => updateAttendee(i, 'name', e.target.value)}
                      placeholder="Full name *"
                      className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="email" value={att.email} onChange={(e) => updateAttendee(i, 'email', e.target.value)}
                      placeholder="Email"
                      className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="text" value={att.role} onChange={(e) => updateAttendee(i, 'role', e.target.value)}
                      placeholder="Role"
                      className="w-28 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {attendees.length > 1 && (
                      <button type="button" onClick={() => removeAttendee(i)} className="p-1 text-gray-400 hover:text-rose-500">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Pre-meeting notes, context, or agenda overview…"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
            <span className="text-xs text-gray-400">Draft saved automatically after creation</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button
                type="submit" disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <>Saving…</> : <><Plus className="w-4 h-4" /> Create Meeting</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Quick Record Modal ─────────────────────────────────────────────────────────

function QuickRecordModal({
  onClose, onCreated
}: { onClose: () => void; onCreated: (id: string) => void }): React.JSX.Element {
  const nowLocal = (): string => {
    const d = new Date()
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  }
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState(nowLocal)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) { setError('Meeting title is required'); return }
    setSaving(true); setError('')
    try {
      const result = await meetingsCreate({
        title: title.trim(),
        scheduledStart: new Date(scheduledStart).toISOString(),
        mode: 'in-person',
      })
      onCreated(result.meeting.id)
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
              <Mic className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Start Recording Now</h2>
              <p className="text-xs text-gray-400">Create meeting and go straight to recording</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="px-6 py-5 space-y-4">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Meeting Title *</label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Ops Sync, Client Call…"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Time</label>
            <input
              type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Mic className="w-4 h-4" /> {saving ? 'Creating…' : 'Start Recording'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Meetings Page ─────────────────────────────────────────────────────────────

export function MeetingsPage({ onOpenMeeting }: MeetingsPageProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<DBMeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showQuickRecord, setShowQuickRecord] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await meetingsList({ search: search || undefined, status: filterStatus || undefined })
      setMeetings(data)
    } finally {
      setLoading(false)
    }
  }, [search, filterStatus])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 200)
    return () => clearTimeout(t)
  }, [load])

  const handleDelete = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm('Delete this meeting and all its data? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await meetingsDelete(id)
      setMeetings((prev) => prev.filter((m) => m.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreated = (id: string): void => {
    setShowNewModal(false)
    onOpenMeeting(id)
  }

  const handleQuickRecordCreated = (id: string): void => {
    setShowQuickRecord(false)
    onOpenMeeting(id, 'recording')
  }

  const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const statusBadge = (status: string): React.JSX.Element => {
    const cfg: Record<string, string> = {
      draft:     'bg-amber-100 text-amber-700',
      published: 'bg-emerald-100 text-emerald-700',
      completed: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-gray-100 text-gray-500',
    }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Page header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" /> Meetings
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} · click to open and edit</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickRecord(true)}
              className="flex items-center gap-1.5 bg-rose-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-rose-700 transition-colors"
            >
              <Mic className="w-4 h-4" /> Start Recording Now
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Meeting
            </button>
          </div>
        </div>

        {/* Workflow guide */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl px-4 py-2.5">
          <p className="text-xs font-semibold text-indigo-700 mb-1.5">Meeting Workflow — open a meeting to access each step:</p>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { icon: <Mic className="w-3 h-3" />, label: 'Record', color: 'bg-rose-100 text-rose-700' },
              { icon: <ArrowRight className="w-3 h-3 text-gray-300" />, label: '', color: '' },
              { icon: <FileText className="w-3 h-3" />, label: 'Transcript', color: 'bg-blue-100 text-blue-700' },
              { icon: <ArrowRight className="w-3 h-3 text-gray-300" />, label: '', color: '' },
              { icon: <FileOutput className="w-3 h-3" />, label: 'AI MOM', color: 'bg-purple-100 text-purple-700' },
              { icon: <ArrowRight className="w-3 h-3 text-gray-300" />, label: '', color: '' },
              { icon: <Edit3 className="w-3 h-3" />, label: 'Edit MOM', color: 'bg-amber-100 text-amber-700' },
              { icon: <ArrowRight className="w-3 h-3 text-gray-300" />, label: '', color: '' },
              { icon: <Share2 className="w-3 h-3" />, label: 'Finalize & Share', color: 'bg-emerald-100 text-emerald-700' },
            ].map((step, i) =>
              step.label ? (
                <span key={i} className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${step.color}`}>
                  {step.icon} {step.label}
                </span>
              ) : (
                <span key={i}>{step.icon}</span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings, attendees, codes…"
            className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading meetings…</div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText className="w-12 h-12 text-gray-200" />
            <p className="text-sm text-gray-500 font-medium">{search || filterStatus ? 'No meetings match your search' : 'No meetings yet'}</p>
            {!search && !filterStatus && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-2 flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" /> Create your first meeting
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="text-left px-6 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Meeting Code</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Mode</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Organizer</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => onOpenMeeting(m.id)}
                  className="bg-white hover:bg-indigo-50/40 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3">
                    {m.meeting_code ? (
                      <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">{m.meeting_code}</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Draft — not finalized</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.title}</div>
                    {m.mom_generated ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        <span className="text-xs text-emerald-600">MOM generated</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {fmtDate(m.scheduled_start)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <div className="flex items-center gap-1.5">
                      {m.location && <MapPin className="w-3.5 h-3.5 text-gray-400" />}
                      <span className="capitalize text-xs">{m.mode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {m.organizer ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(m.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenMeeting(m.id) }}
                        className="p-1.5 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600"
                        title="Open editor"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { void handleDelete(m.id, e) }}
                        disabled={deletingId === m.id}
                        className="p-1.5 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 disabled:opacity-40"
                        title="Delete meeting"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && (
        <NewMeetingModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}
      {showQuickRecord && (
        <QuickRecordModal onClose={() => setShowQuickRecord(false)} onCreated={handleQuickRecordCreated} />
      )}
    </div>
  )
}
