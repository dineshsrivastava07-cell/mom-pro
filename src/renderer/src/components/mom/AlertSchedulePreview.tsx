// Phase 20 Part B — Alert Schedule Preview (shown in MOM Editor)

import React, { useState } from 'react'
import { Bell, ChevronDown, ChevronUp, AlertTriangle, Calendar } from 'lucide-react'
import { Task } from '../../../../shared/types/meeting.types'
import { ItemCodeBadge } from '../ui/MeetingCodeBadge'

interface AlertSchedulePreviewProps {
  tasks: Task[]
  activateOnFinalize: boolean
  onToggleActivate: (val: boolean) => void
}

interface TaskAlertConfig {
  taskId: string
  oneWeek: boolean
  twoDays: boolean
  oneDay: boolean
  sameDay: boolean
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function formatDateShort(d: Date): string {
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

export function AlertSchedulePreview({
  tasks,
  activateOnFinalize,
  onToggleActivate
}: AlertSchedulePreviewProps): React.JSX.Element {
  const [customized, setCustomized] = useState<Record<string, TaskAlertConfig>>({})
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const tasksWithDeadline = tasks.filter((t) => t.deadline)
  const tasksWithoutDeadline = tasks.filter((t) => !t.deadline)

  const totalAlerts = tasksWithDeadline.reduce((sum, task) => {
    const cfg = customized[task.id]
    const count = cfg
      ? [cfg.oneWeek, cfg.twoDays, cfg.oneDay, cfg.sameDay].filter(Boolean).length
      : 4
    return sum + count + (task.wasShared ? 0 : 1)   // +1 for unshared alert
  }, 0) + tasksWithoutDeadline.length   // +1 no-deadline alert each

  const getConfig = (taskId: string): TaskAlertConfig =>
    customized[taskId] ?? { taskId, oneWeek: true, twoDays: true, oneDay: true, sameDay: true }

  const updateConfig = (taskId: string, field: keyof Omit<TaskAlertConfig, 'taskId'>, val: boolean): void => {
    setCustomized((prev) => ({
      ...prev,
      [taskId]: { ...getConfig(taskId), [field]: val }
    }))
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-100 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-700" />
          <span className="text-sm font-bold text-indigo-900">Alert Schedule Preview</span>
        </div>
        <p className="text-xs text-indigo-600 mt-0.5">
          These alerts will activate when you finalize this MOM
        </p>
      </div>

      {/* Task Alert Rows */}
      <div className="p-3 space-y-2">

        {/* Tasks WITH deadlines */}
        {tasksWithDeadline.map((task) => {
          const deadline = new Date(task.deadline!)
          const cfg = getConfig(task.id)
          const isExpanded = expandedTask === task.id

          const w = addDays(deadline, -7)
          const d2 = addDays(deadline, -2)
          const d1 = addDays(deadline, -1)

          return (
            <div key={task.id} className="bg-white rounded-lg border border-indigo-100 overflow-hidden">
              <div className="px-3 py-2">
                {/* Task header */}
                <div className="flex items-center gap-2 mb-1.5">
                  {task.itemCode && <ItemCodeBadge code={task.itemCode.full} size="sm" />}
                  <span className="text-xs font-semibold text-gray-900 flex-1 truncate">{task.title}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {task.assignedTo} · Deadline: {deadline.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>

                {/* Alert timeline */}
                <div className="space-y-1">
                  {cfg.oneWeek && (
                    <AlertRow emoji="⏰" color="text-blue-600" label={`${formatDateShort(w)} (9 AM)`} desc="1 week reminder" />
                  )}
                  {cfg.twoDays && (
                    <AlertRow emoji="⚠️" color="text-amber-600" label={`${formatDateShort(d2)} (9 AM)`} desc="2 days reminder" />
                  )}
                  {cfg.oneDay && (
                    <AlertRow emoji="🔴" color="text-orange-600" label={`${formatDateShort(d1)} (9 AM)`} desc="1 day reminder" />
                  )}
                  {cfg.sameDay && (
                    <AlertRow emoji="🚨" color="text-rose-600" label={`${formatDateShort(deadline)} (9 AM)`} desc="Deadline day (overdue if not done)" />
                  )}
                  {!task.wasShared && (
                    <AlertRow emoji="📤" color="text-purple-600" label="24h after MOM" desc="Not shared alert" />
                  )}
                </div>

                {/* Customize toggle */}
                <button
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-2 font-medium"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Customize alerts for this task
                </button>
              </div>

              {/* Custom toggle panel */}
              {isExpanded && (
                <div className="bg-indigo-50 px-3 py-2 border-t border-indigo-100 flex flex-wrap gap-3">
                  {[
                    { key: 'oneWeek', label: '1-week' },
                    { key: 'twoDays', label: '2-day' },
                    { key: 'oneDay', label: '1-day' },
                    { key: 'sameDay', label: 'Same-day' }
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfg[key as keyof Omit<TaskAlertConfig, 'taskId'>]}
                        onChange={(e) => updateConfig(task.id, key as keyof Omit<TaskAlertConfig, 'taskId'>, e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-xs text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Tasks WITHOUT deadlines */}
        {tasksWithoutDeadline.map((task) => (
          <div key={task.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {task.itemCode && <ItemCodeBadge code={task.itemCode.full} size="sm" />}
              <span className="text-xs font-semibold text-gray-700 truncate flex-1">{task.title}</span>
            </div>
            <p className="text-xs text-amber-700">No deadline set — alert will fire in 12 hours</p>
            <button className="text-xs text-amber-800 underline font-medium mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Set Deadline Now
            </button>
          </div>
        ))}

        {tasks.length === 0 && (
          <p className="text-xs text-indigo-500 text-center py-3">No action items yet</p>
        )}
      </div>

      {/* Footer: total + activate checkbox */}
      <div className="px-4 py-3 bg-indigo-100 border-t border-indigo-200">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-indigo-800">
            Total alerts to be created: <span className="text-indigo-600 text-sm">{totalAlerts}</span>
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activateOnFinalize}
              onChange={(e) => onToggleActivate(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <span className="text-xs font-semibold text-indigo-900">Finalize and Activate All Alerts</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function AlertRow({ emoji, color, label, desc }: {
  emoji: string; color: string; label: string; desc: string
}): React.JSX.Element {
  return (
    <div className={`flex items-center gap-2 text-xs ${color}`}>
      <span>{emoji}</span>
      <span className="font-medium w-28 flex-shrink-0">{label}</span>
      <span className="text-gray-500">— {desc}</span>
    </div>
  )
}
