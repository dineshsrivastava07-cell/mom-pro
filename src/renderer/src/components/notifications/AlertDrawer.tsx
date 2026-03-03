// Phase 18 Part A — Alert Drawer (slide-in from right)

import React, { useState, useEffect } from 'react'
import { X, BellRing, ChevronRight, Clock, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Alert, AlertSeverity } from '../../../../shared/types/alert.types'
import { MeetingCodeBadge, ItemCodeBadge } from '../ui/MeetingCodeBadge'
import { FollowUpRemarkModal } from './FollowUpRemarkModal'

interface AlertDrawerProps {
  isOpen: boolean
  onClose: () => void
  onOpenAlertCenter: () => void
}

type FilterTab = 'all' | 'critical' | 'followup' | 'deadlines' | 'unshared'

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 1, urgent: 2, warning: 3, info: 4
}

const SNOOZE_OPTIONS = [
  { label: '1 Hour',       minutes: 60  },
  { label: '4 Hours',      minutes: 240 },
  { label: 'Tomorrow 9 AM', minutes: -1 },
  { label: '2 Days',       minutes: -2  },
]

export function AlertDrawer({ isOpen, onClose, onOpenAlertCenter }: AlertDrawerProps): React.JSX.Element {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [showRemarkModal, setShowRemarkModal] = useState<string | null>(null)
  const [snoozeDropdown, setSnoozeDropdown] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    loadAlerts()

    // Listen for new alerts from main process
    const onAlertUpdate = (): void => { void loadAlerts() }
    window.electron.ipcRenderer.on('alert:fired', onAlertUpdate)
    window.electron.ipcRenderer.on('alert:chain-resolved', onAlertUpdate)
    window.electron.ipcRenderer.on('alert:remark-added', onAlertUpdate)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('alert:fired')
      window.electron.ipcRenderer.removeAllListeners('alert:chain-resolved')
      window.electron.ipcRenderer.removeAllListeners('alert:remark-added')
    }
  }, [isOpen])

  const loadAlerts = async (): Promise<void> => {
    const data = await window.electron.ipcRenderer.invoke('alerts:get-active') as Alert[]
    setAlerts(data.sort((a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      new Date(a.scheduledFireAt).getTime() - new Date(b.scheduledFireAt).getTime()
    ))
  }

  const filteredAlerts = alerts.filter((a) => {
    switch (activeTab) {
      case 'critical': return a.severity === 'critical' || a.severity === 'urgent'
      case 'followup': return a.isFollowUpAlert || a.requiresFollowUpRemark
      case 'deadlines': return ['deadline_1week','deadline_2days','deadline_1day','deadline_overdue'].includes(a.triggerType)
      case 'unshared': return ['task_unshared','task_undelegated'].includes(a.triggerType)
      default: return true
    }
  })

  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical' || a.severity === 'urgent').length,
    followup: alerts.filter((a) => a.requiresFollowUpRemark).length,
    deadlines: alerts.filter((a) => a.triggerType.startsWith('deadline')).length,
    unshared: alerts.filter((a) => ['task_unshared','task_undelegated'].includes(a.triggerType)).length
  }

  const handleSnooze = async (alertId: string, minutes: number): Promise<void> => {
    await window.electron.ipcRenderer.invoke('alerts:snooze', alertId, minutes)
    setSnoozeDropdown(null)
    loadAlerts()
  }

  const handleDismiss = async (alertId: string): Promise<void> => {
    const result = await window.electron.ipcRenderer.invoke('alerts:dismiss', alertId) as { success: boolean }
    if (!result.success) {
      setShowRemarkModal(alertId)
    } else {
      loadAlerts()
    }
  }

  const handleMarkDone = async (taskId: string): Promise<void> => {
    await window.electron.ipcRenderer.invoke('alerts:resolve-chain', taskId)
    loadAlerts()
  }

  const markAllRead = async (): Promise<void> => {
    for (const a of alerts.filter((a) => !a.requiresFollowUpRemark)) {
      await window.electron.ipcRenderer.invoke('alerts:dismiss', a.id)
    }
    loadAlerts()
  }

  if (!isOpen) return <></>

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`
          fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl z-50
          flex flex-col border-l border-gray-200
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-gray-700" />
            <span className="font-semibold text-sm text-gray-900">Alerts & Follow-ups</span>
          </div>
          <div className="flex items-center gap-1">
            {counts.all > 0 && (
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">
                {counts.critical > 0 ? `${counts.critical} critical` : `${counts.all} active`}
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white">
          <button
            onClick={markAllRead}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={() => { onOpenAlertCenter(); onClose() }}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            Open Alert Center <ChevronRight className="w-3 h-3" />
          </button>
          <button onClick={onClose}>
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
          {(['all','critical','followup','deadlines','unshared'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-all
                ${activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
              `}
            >
              {tab === 'all' && `ALL (${counts.all})`}
              {tab === 'critical' && `🚨 Critical (${counts.critical})`}
              {tab === 'followup' && `⚠️ Follow-up (${counts.followup})`}
              {tab === 'deadlines' && `📅 Deadlines (${counts.deadlines})`}
              {tab === 'unshared' && `📤 Unshared (${counts.unshared})`}
            </button>
          ))}
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto">
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <BellRing className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No active alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  isSelected={selectedAlertId === alert.id}
                  onSelect={() => setSelectedAlertId(alert.id === selectedAlertId ? null : alert.id)}
                  onSnooze={(id) => setSnoozeDropdown(id === snoozeDropdown ? null : id)}
                  onDismiss={handleDismiss}
                  onMarkDone={handleMarkDone}
                  onAddRemark={(id) => setShowRemarkModal(id)}
                  snoozeOpen={snoozeDropdown === alert.id}
                  onSnoozeSelect={handleSnooze}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Follow-up Remark Modal */}
      {showRemarkModal && (
        <FollowUpRemarkModal
          alertId={showRemarkModal}
          onClose={() => setShowRemarkModal(null)}
          onSubmit={() => { setShowRemarkModal(null); loadAlerts() }}
        />
      )}
    </>
  )
}

// ─── ALERT CARD ──────────────────────────────────────────────────────────────
interface AlertCardProps {
  alert: Alert
  isSelected: boolean
  onSelect: () => void
  onSnooze: (id: string) => void
  onDismiss: (id: string) => void
  onMarkDone: (taskId: string) => void
  onAddRemark: (id: string) => void
  snoozeOpen: boolean
  onSnoozeSelect: (id: string, minutes: number) => void
}

function AlertCard({
  alert, isSelected, onSelect, onSnooze, onDismiss, onMarkDone, onAddRemark,
  snoozeOpen, onSnoozeSelect
}: AlertCardProps): React.JSX.Element {
  const severityBorder: Record<AlertSeverity, string> = {
    critical: 'border-l-rose-500',
    urgent: 'border-l-orange-500',
    warning: 'border-l-amber-500',
    info: 'border-l-indigo-400'
  }
  const severityIcon: Record<AlertSeverity, React.JSX.Element> = {
    critical: <AlertCircle className="w-3.5 h-3.5 text-rose-500" />,
    urgent: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    info: <Info className="w-3.5 h-3.5 text-indigo-400" />
  }

  const isRemarkRequired = alert.requiresFollowUpRemark
  const deadlineDaysAgo = alert.deadline
    ? Math.floor((Date.now() - new Date(alert.deadline).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div
      className={`
        p-3 border-l-4 cursor-pointer transition-colors
        ${severityBorder[alert.severity]}
        ${isRemarkRequired
          ? 'bg-rose-50'
          : isSelected
            ? 'bg-indigo-50'
            : 'bg-white hover:bg-gray-50'}
      `}
      onClick={onSelect}
    >
      {/* Top row: severity + meeting code */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {severityIcon[alert.severity]}
          <span className={`text-xs font-bold uppercase tracking-wide
            ${alert.severity === 'critical' ? 'text-rose-600' :
              alert.severity === 'urgent' ? 'text-orange-600' :
              alert.severity === 'warning' ? 'text-amber-600' : 'text-indigo-500'}
          `}>
            {alert.severity}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isRemarkRequired && (
            <span className="text-xs bg-rose-200 text-rose-700 px-1.5 py-0.5 rounded font-bold">
              REMARK REQ
            </span>
          )}
          <MeetingCodeBadge code={alert.meetingCode} size="sm" showCopy={false} showType={false} />
        </div>
      </div>

      {/* Item code + title */}
      <div className="flex items-start gap-1.5 mb-1">
        {alert.itemCode && <ItemCodeBadge code={alert.itemCode} size="sm" />}
        <p className="text-xs font-semibold text-gray-900 flex-1 leading-snug">{alert.title}</p>
      </div>

      {/* Assignee + deadline info */}
      <p className="text-xs text-gray-500 mb-0.5">
        {alert.assignedTo}
        {deadlineDaysAgo !== null && deadlineDaysAgo > 0 && (
          <span className="text-rose-500 font-medium"> · {deadlineDaysAgo}d past deadline</span>
        )}
      </p>
      <p className="text-xs text-gray-400">
        {alert.meetingTitle} · {new Date(alert.meetingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </p>

      {/* Snooze count warning */}
      {alert.snoozeCount >= 2 && (
        <p className="text-xs text-amber-600 mt-1 font-medium">
          ⚠️ Snoozed {alert.snoozeCount} times previously
        </p>
      )}

      {/* Action buttons */}
      {isSelected && (
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isRemarkRequired ? (
            <button
              onClick={() => onAddRemark(alert.id)}
              className="text-xs bg-rose-600 text-white px-2.5 py-1 rounded font-medium hover:bg-rose-700"
            >
              ADD REMARK ⚠️
            </button>
          ) : (
            <>
              {alert.taskId && (
                <button
                  onClick={() => onMarkDone(alert.taskId!)}
                  className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded font-medium hover:bg-emerald-700"
                >
                  ✅ Mark Done
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => onSnooze(alert.id)}
                  className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded font-medium hover:bg-amber-200 flex items-center gap-1"
                >
                  <Clock className="w-3 h-3" /> Snooze
                </button>
                {snoozeOpen && (
                  <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                    {SNOOZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => onSnoozeSelect(alert.id, opt.minutes)}
                        className="block w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded font-medium hover:bg-gray-200"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
