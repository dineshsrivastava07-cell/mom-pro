// Phase 18 Part C — Mandatory Follow-Up Remark Modal
// Cannot be closed without completing the remark

import React, { useState } from 'react'
import { AlertCircle } from 'lucide-react'

type NewStatus = 'completed' | 'in_progress' | 'blocked' | 'deferred' | 'cancelled'

interface AlertDetail {
  id: string
  meetingCode: string
  meetingTitle: string
  meetingDate: string
  itemCode: string
  taskTitle?: string
  assignedTo: string
  deadline?: string
}

interface FollowUpRemarkModalProps {
  alertId: string
  onClose?: () => void
  onSubmit: () => void
}

const STATUS_OPTIONS: { value: NewStatus; label: string; emoji: string; desc: string }[] = [
  { value: 'completed',   label: 'Completed',   emoji: '✅', desc: 'Task is finished' },
  { value: 'in_progress', label: 'In Progress', emoji: '🔄', desc: 'Still working, needs more time' },
  { value: 'blocked',     label: 'Blocked',     emoji: '🚫', desc: 'Blocked by dependency (must explain)' },
  { value: 'deferred',    label: 'Deferred',    emoji: '📅', desc: 'Pushed to later date (set new date)' },
  { value: 'cancelled',   label: 'Cancelled',   emoji: '❌', desc: 'No longer needed (must explain)' },
]

const REMARK_PLACEHOLDERS: Record<NewStatus, string> = {
  completed:   'Describe what was completed and any final notes...',
  in_progress: 'Describe current progress and expected completion...',
  blocked:     'What is blocking this task? Who needs to unblock it?',
  deferred:    'Why was this deferred? Approved by whom?',
  cancelled:   'Why is this task no longer needed?',
}

export function FollowUpRemarkModal({ alertId, onSubmit }: FollowUpRemarkModalProps): React.JSX.Element {
  const [alertDetail, setAlertDetail] = useState<AlertDetail | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<NewStatus | null>(null)
  const [remark, setRemark] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [impactNote, setImpactNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [remarkBy] = useState('Current User')  // TODO: wire user context

  // Load alert detail on mount
  React.useEffect(() => {
    ;(async () => {
      const alerts = await window.electron.ipcRenderer.invoke('alerts:get-all', {
        status: ['fired', 'scheduled', 'snoozed'],
        limit: 200
      }) as AlertDetail[]
      const found = alerts.find((a) => a.id === alertId)
      if (found) setAlertDetail(found)
    })()
  }, [alertId])

  const daysOverdue = alertDetail?.deadline
    ? Math.floor((Date.now() - new Date(alertDetail.deadline).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const needsNewDeadline = selectedStatus === 'in_progress' || selectedStatus === 'deferred'
  const isValid =
    selectedStatus !== null &&
    remark.trim().length >= 20 &&
    (!needsNewDeadline || newDeadline)

  const handleSubmit = async (): Promise<void> => {
    if (!isValid || !alertDetail) return
    setSubmitting(true)
    try {
      await window.electron.ipcRenderer.invoke('alerts:add-remark', alertId, {
        alertId,
        taskId: alertDetail.id,
        itemCode: alertDetail.itemCode,
        remark: remark.trim(),
        remarkBy,
        newStatus: selectedStatus,
        newDeadline: newDeadline ? new Date(newDeadline) : undefined,
        impactNote: impactNote.trim() || undefined
      })
      onSubmit()
    } finally {
      setSubmitting(false)
    }
  }

  // Default 7 days from today for deadline picker
  const defaultDeadline = (): string => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-rose-600 text-white px-6 py-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-bold">Mandatory Follow-Up Required</h2>
              <p className="text-rose-200 text-sm mt-0.5">
                This task requires a status update before it can proceed
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Context box */}
          {alertDetail && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                  {alertDetail.meetingCode}
                </span>
                <span className="text-xs text-gray-500">{alertDetail.meetingTitle}</span>
              </div>
              {alertDetail.itemCode && (
                <p className="text-sm font-semibold text-gray-900">
                  <span className="font-mono text-xs text-blue-600 mr-1.5">[{alertDetail.itemCode.split('/')[1]}]</span>
                  {alertDetail.taskTitle}
                </p>
              )}
              <p className="text-xs text-gray-500">Assigned to: <strong>{alertDetail.assignedTo}</strong></p>
              {alertDetail.deadline && (
                <p className="text-xs text-gray-500">
                  Original Deadline: <strong>{new Date(alertDetail.deadline).toLocaleDateString('en-IN')}</strong>
                </p>
              )}
              {daysOverdue !== null && daysOverdue > 0 && (
                <p className="text-xs text-rose-600 font-bold">Days Overdue: {daysOverdue} days</p>
              )}
              <p className="text-xs text-gray-400">
                Meeting Date: {new Date(alertDetail.meetingDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}

          {/* New Status Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              New Status <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedStatus(opt.value)
                    if (needsNewDeadline && !newDeadline) {
                      setNewDeadline(defaultDeadline())
                    }
                  }}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all
                    ${selectedStatus === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'}
                  `}
                >
                  <span className="text-lg">{opt.emoji}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Remark Textarea */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Remark / Status Update <span className="text-rose-500">*</span>
              <span className="font-normal text-gray-400 ml-1">(min 20 chars)</span>
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={4}
              placeholder={selectedStatus ? REMARK_PLACEHOLDERS[selectedStatus] : 'Select a status above, then describe the current situation...'}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">
                {remark.length < 20
                  ? `${20 - remark.length} more characters required`
                  : `${remark.length} characters`}
              </span>
              <span className={`text-xs font-medium ${remark.length >= 20 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {remark.length >= 20 ? '✓ Sufficient' : ''}
              </span>
            </div>
          </div>

          {/* New Deadline (if In Progress or Deferred) */}
          {needsNewDeadline && (
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                New Deadline <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={newDeadline}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Impact Note (optional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Impact / Escalation Note
              <span className="font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <textarea
              value={impactNote}
              onChange={(e) => setImpactNote(e.target.value)}
              rows={2}
              placeholder="Does this delay affect any other tasks or meetings?"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`
              w-full py-3 rounded-xl font-semibold text-sm transition-all
              ${isValid && !submitting
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            {submitting ? 'Saving...' : 'Save Follow-Up Remark & Resolve Alert'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            This remark will be attached to the MOM record permanently.
          </p>
        </div>
      </div>
    </div>
  )
}
