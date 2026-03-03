// Phase 18 Part B — Alert Center Full Page (custom resizable panels)

import React, { useState, useEffect } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Upload, Clock, Info, GripVertical } from 'lucide-react'
import { Alert } from '../../../../shared/types/alert.types'
import { MeetingCodeBadge, ItemCodeBadge } from '../../components/ui/MeetingCodeBadge'
import { FollowUpRemarkModal } from '../../components/notifications/FollowUpRemarkModal'
import { useResizable } from '../../hooks/useResizable'

type GroupKey = 'today' | 'yesterday' | 'this_week' | 'older'

function groupAlerts(alerts: Alert[]): Record<GroupKey, Alert[]> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

  const groups: Record<GroupKey, Alert[]> = { today: [], yesterday: [], this_week: [], older: [] }

  for (const alert of alerts) {
    const d = new Date(alert.scheduledFireAt)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if      (day.getTime() === today.getTime())     groups.today.push(alert)
    else if (day.getTime() === yesterday.getTime()) groups.yesterday.push(alert)
    else if (day > weekAgo)                         groups.this_week.push(alert)
    else                                            groups.older.push(alert)
  }
  return groups
}

// ─── DRAG HANDLE ──────────────────────────────────────────────────────────────
function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }): React.JSX.Element {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 hover:w-[3px] transition-colors duration-150 flex items-center justify-center group"
      title="Drag to resize"
    >
      <GripVertical className="w-3 h-3 text-gray-400 group-hover:text-indigo-600" />
    </div>
  )
}

export default function AlertCenter(): React.JSX.Element {
  const [alerts, setAlerts]           = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [showRemarkModal, setShowRemarkModal] = useState<string | null>(null)
  const [snoozeOpen, setSnoozeOpen]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)

  // Left panel (alert list) is resizable; right panel takes remaining space
  const listPanel = useResizable({ initial: 360, min: 240, max: 600 })

  const loadAlerts = async (): Promise<void> => {
    setLoading(true)
    const data = await window.electron.ipcRenderer.invoke('alerts:get-active') as Alert[]
    setAlerts(data)
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()
    const onUpdate = (): void => { void loadAlerts() }
    window.electron.ipcRenderer.on('alert:fired', onUpdate)
    window.electron.ipcRenderer.on('alert:chain-resolved', onUpdate)
    window.electron.ipcRenderer.on('alert:remark-added', onUpdate)
    return () => {
      window.electron.ipcRenderer.removeAllListeners('alert:fired')
      window.electron.ipcRenderer.removeAllListeners('alert:chain-resolved')
      window.electron.ipcRenderer.removeAllListeners('alert:remark-added')
    }
  }, [])

  const criticalCount  = alerts.filter((a) => a.severity === 'critical').length
  const followupCount  = alerts.filter((a) => a.requiresFollowUpRemark).length
  const unsharedCount  = alerts.filter((a) => ['task_unshared','task_undelegated'].includes(a.triggerType)).length
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.requiresFollowUpRemark)
  const grouped        = groupAlerts(alerts.filter((a) => !criticalAlerts.includes(a)))

  const handleMarkDone = async (taskId: string): Promise<void> => {
    await window.electron.ipcRenderer.invoke('alerts:resolve-chain', taskId)
    setSelectedAlert(null)
    void loadAlerts()
  }

  const handleDismiss = async (alertId: string): Promise<void> => {
    const result = await window.electron.ipcRenderer.invoke('alerts:dismiss', alertId) as { success: boolean }
    if (!result.success) {
      setShowRemarkModal(alertId)
    } else {
      if (selectedAlert?.id === alertId) setSelectedAlert(null)
      void loadAlerts()
    }
  }

  const handleSnooze = async (alertId: string, minutes: number): Promise<void> => {
    await window.electron.ipcRenderer.invoke('alerts:snooze', alertId, minutes)
    setSnoozeOpen(null)
    void loadAlerts()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-sm">Loading alerts...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">🔔 Alert Center</h1>
        <p className="text-xs text-gray-500 mt-0.5">Track deadlines, follow-ups, and delegation status</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 flex-shrink-0 bg-white border-b border-gray-100">
        <StatCard icon={<AlertCircle  className="w-4 h-4" />} label="Critical"       count={criticalCount} color="rose" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Follow-ups"   count={followupCount} color="amber" />
        <StatCard icon={<Upload       className="w-4 h-4" />} label="Unshared"       count={unsharedCount} color="indigo" />
        <StatCard icon={<CheckCircle  className="w-4 h-4" />} label="Active Alerts" count={alerts.length}  color="emerald" />
      </div>

      {/* Resizable left/right body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Alert List ── */}
        <div
          className="flex flex-col bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden"
          style={{ width: listPanel.size }}
        >
          <div className="flex-1 overflow-y-auto">
            {/* Critical pinned */}
            {criticalAlerts.length > 0 && (
              <div className="border-b-2 border-rose-200">
                <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 sticky top-0 z-10">
                  <p className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                    🚨 {criticalAlerts.length} Critical — Action Required
                  </p>
                </div>
                {criticalAlerts.map((alert) => (
                  <AlertListItem
                    key={alert.id}
                    alert={alert}
                    isSelected={selectedAlert?.id === alert.id}
                    onSelect={() => setSelectedAlert(selectedAlert?.id === alert.id ? null : alert)}
                  />
                ))}
              </div>
            )}

            {/* Timeline groups */}
            {(['today','yesterday','this_week','older'] as GroupKey[]).map((key) => {
              const group = grouped[key]
              if (!group.length) return null
              const labels = { today: 'TODAY', yesterday: 'YESTERDAY', this_week: 'THIS WEEK', older: 'OLDER' }
              return (
                <div key={key}>
                  <div className="px-4 py-2 bg-gray-50 border-b border-t border-gray-100 sticky top-0 z-10">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{labels[key]}</p>
                  </div>
                  {group.map((alert) => (
                    <AlertListItem
                      key={alert.id}
                      alert={alert}
                      isSelected={selectedAlert?.id === alert.id}
                      onSelect={() => setSelectedAlert(selectedAlert?.id === alert.id ? null : alert)}
                    />
                  ))}
                </div>
              )
            })}

            {alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <CheckCircle className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">All clear!</p>
                <p className="text-xs">No active alerts</p>
              </div>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <DragHandle onMouseDown={listPanel.handleMouseDown} />

        {/* ── Right: Alert Detail ── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5 bg-gray-50">
          {selectedAlert ? (
            <AlertDetailPanel
              alert={selectedAlert}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              snoozeOpen={snoozeOpen === selectedAlert.id}
              onToggleSnooze={() => setSnoozeOpen(snoozeOpen === selectedAlert.id ? null : selectedAlert.id)}
              onAddRemark={() => setShowRemarkModal(selectedAlert.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Info className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium text-gray-600">Select an alert</p>
              <p className="text-sm">Click any alert on the left to see details and actions</p>
            </div>
          )}
        </div>
      </div>

      {showRemarkModal && (
        <FollowUpRemarkModal
          alertId={showRemarkModal}
          onClose={() => setShowRemarkModal(null)}
          onSubmit={() => { setShowRemarkModal(null); void loadAlerts() }}
        />
      )}
    </div>
  )
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, count, color }: {
  icon: React.ReactNode; label: string; count: number; color: string
}): React.JSX.Element {
  const colorMap: Record<string, string> = {
    rose:    'bg-rose-50 border-rose-200 text-rose-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-80 truncate">{label}</span>
      </div>
      <p className="text-xl font-bold">{count}</p>
    </div>
  )
}

// ─── ALERT LIST ITEM ──────────────────────────────────────────────────────────
function AlertListItem({ alert, isSelected, onSelect }: {
  alert: Alert; isSelected: boolean; onSelect: () => void
}): React.JSX.Element {
  const severityBorder: Record<string, string> = {
    critical: 'border-l-rose-500',
    urgent:   'border-l-orange-500',
    warning:  'border-l-amber-400',
    info:     'border-l-indigo-400',
  }
  return (
    <div
      className={`px-4 py-3 border-l-4 cursor-pointer border-b border-gray-100 transition-colors
        ${severityBorder[alert.severity]}
        ${isSelected ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}
      `}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {alert.itemCode && <ItemCodeBadge code={alert.itemCode} size="sm" />}
          <span className={`text-xs uppercase font-bold tracking-wide flex-shrink-0
            ${alert.severity === 'critical' ? 'text-rose-600' :
              alert.severity === 'urgent'   ? 'text-orange-500' :
              alert.severity === 'warning'  ? 'text-amber-500' : 'text-indigo-500'}
          `}>{alert.severity}</span>
        </div>
        {alert.requiresFollowUpRemark && (
          <span className="text-[10px] bg-rose-200 text-rose-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0 ml-1">REQ</span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-900 line-clamp-2">{alert.title}</p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">
        {alert.assignedTo} · {new Date(alert.meetingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
      </p>
    </div>
  )
}

// ─── ALERT DETAIL PANEL ───────────────────────────────────────────────────────
const SNOOZE_OPTIONS = [
  { label: '1 Hour',        minutes: 60  },
  { label: '4 Hours',       minutes: 240 },
  { label: 'Tomorrow 9 AM', minutes: -1  },
  { label: '2 Days',        minutes: -2  },
]

function AlertDetailPanel({ alert, onMarkDone, onDismiss, onSnooze, snoozeOpen, onToggleSnooze, onAddRemark }: {
  alert: Alert
  onMarkDone: (taskId: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  snoozeOpen: boolean
  onToggleSnooze: () => void
  onAddRemark: () => void
}): React.JSX.Element {
  return (
    <div className="max-w-2xl">
      {/* Severity + trigger */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-sm font-bold uppercase px-3 py-1 rounded-full
          ${alert.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
            alert.severity === 'urgent'   ? 'bg-orange-100 text-orange-700' :
            alert.severity === 'warning'  ? 'bg-amber-100 text-amber-700' :
            'bg-indigo-100 text-indigo-700'}`}>
          {alert.severity}
        </span>
        <span className="text-sm text-gray-500">{alert.triggerType.replace(/_/g, ' ')}</span>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-4">{alert.title}</h2>

      {/* Meeting */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span>📋</span>
          <MeetingCodeBadge code={alert.meetingCode} size="md" />
        </div>
        <p className="text-sm font-semibold text-gray-900">{alert.meetingTitle}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {new Date(alert.meetingDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Task */}
      {alert.taskTitle && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span>✅</span>
            {alert.itemCode && <ItemCodeBadge code={alert.itemCode} size="md" />}
          </div>
          <p className="text-sm font-semibold text-gray-900">{alert.taskTitle}</p>
          <p className="text-xs text-gray-500 mt-1">Assigned to: <strong>{alert.assignedTo}</strong></p>
          {alert.deadline && (
            <p className="text-xs text-gray-500">
              Deadline: <strong>{new Date(alert.deadline).toLocaleDateString('en-IN')}</strong>
            </p>
          )}
        </div>
      )}

      {/* Message */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{alert.detailMessage}</pre>
      </div>

      {/* Snooze warning */}
      {alert.snoozeCount >= 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
          <p className="text-xs text-amber-700 font-medium">
            ⚠️ Snoozed {alert.snoozeCount} times — consider resolving it now.
          </p>
        </div>
      )}

      {/* Actions */}
      {alert.requiresFollowUpRemark ? (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4">
          <p className="text-sm font-bold text-rose-700 mb-1">⚠️ FOLLOW-UP REMARK REQUIRED</p>
          <p className="text-xs text-rose-600 mb-3">This task is overdue. You must provide a status update before this alert can be resolved.</p>
          <button onClick={onAddRemark} className="w-full bg-rose-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-rose-700 transition-colors">
            Add Mandatory Follow-Up Remark
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {alert.taskId && (
            <button onClick={() => onMarkDone(alert.taskId!)} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
              ✅ Mark Task Done
            </button>
          )}
          <div className="relative">
            <button onClick={onToggleSnooze} className="w-full bg-amber-100 text-amber-800 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-200 transition-colors flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" /> Snooze
            </button>
            {snoozeOpen && (
              <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                {SNOOZE_OPTIONS.map((opt) => (
                  <button key={opt.label} onClick={() => onSnooze(alert.id, opt.minutes)} className="block w-full text-left text-sm px-4 py-2.5 hover:bg-gray-50 text-gray-700 border-b border-gray-100 last:border-0">
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => onDismiss(alert.id)} className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            ❌ Dismiss Alert
          </button>
        </div>
      )}
    </div>
  )
}
