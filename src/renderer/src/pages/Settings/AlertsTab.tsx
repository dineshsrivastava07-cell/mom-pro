// Phase 21 — Alerts & Follow-ups Settings Tab

import React, { useState, useEffect } from 'react'
import { AlertPreferences, DEFAULT_ALERT_PREFERENCES } from '../../../../shared/types/alert.types'

export function AlertsTab(): React.JSX.Element {
  const [prefs, setPrefs] = useState<AlertPreferences>(DEFAULT_ALERT_PREFERENCES)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const loaded = await window.electron.ipcRenderer.invoke('alerts:get-preferences') as AlertPreferences | null
      if (loaded) setPrefs(loaded)
    })()
  }, [])

  const updatePref = <K extends keyof AlertPreferences>(key: K, value: AlertPreferences[K]): void => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }

  const updateNested = <
    K extends keyof AlertPreferences,
    NK extends keyof AlertPreferences[K]
  >(key: K, subKey: NK, value: AlertPreferences[K][NK]): void => {
    setPrefs((p) => ({
      ...p,
      [key]: { ...(p[key] as object), [subKey]: value }
    }))
  }

  const handleSave = async (): Promise<void> => {
    await window.electron.ipcRenderer.invoke('alerts:save-preferences', prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestAlert = async (type: string): Promise<void> => {
    setTestResult(`Firing ${type} test notification...`)
    // Fire a test notification via IPC (main process handles the actual notification)
    await window.electron.ipcRenderer.invoke('alerts:generate-for-task', {
      id: 'test-task', title: `Test: ${type}`, assignedTo: 'Test User',
      meetingCode: 'MTG-TEST-001', mtgCodeRef: 'MTG-TEST-001',
      wasShared: false, wasDelegated: false, isManual: true,
      priority: 'high', status: 'pending',
      createdAt: new Date(), updatedAt: new Date(), meetingId: 'test'
    }, {
      id: 'test-meeting', title: 'Test Meeting', meetingCode: 'MTG-TEST-001',
      scheduledStart: new Date(), mode: 'in-person', attendees: [],
      organizer: 'Test', status: 'completed', momGenerated: false,
      llmModel: 'qwen2.5:3b', createdAt: new Date(), updatedAt: new Date()
    })
    setTimeout(() => setTestResult(null), 3000)
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Section 1: Deadline Alerts */}
      <Section title="🔔 Section 1: Deadline Alerts">
        <Toggle
          label="Enable Deadline Alerts"
          checked={prefs.enabled}
          onChange={(v) => updatePref('enabled', v)}
          desc="Master switch for all alert types"
        />
        {prefs.enabled && (
          <div className="mt-4 space-y-3 pl-4 border-l-2 border-indigo-100">
            <p className="text-sm font-medium text-gray-700">Deadline Reminder Schedule:</p>
            {[
              { key: 'oneWeekBefore', timeKey: 'oneWeekTime', label: '1 week before' },
              { key: 'twoDaysBefore', timeKey: 'twoDaysTime', label: '2 days before' },
              { key: 'oneDayBefore', timeKey: 'oneDayTime', label: '1 day before' },
              { key: 'onDayOf', timeKey: 'onDayOfTime', label: 'Day of deadline' },
            ].map(({ key, timeKey, label }) => (
              <div key={key} className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.deadlineAlerts[key as keyof typeof prefs.deadlineAlerts] as boolean}
                    onChange={(e) => updateNested('deadlineAlerts', key as keyof typeof prefs.deadlineAlerts, e.target.checked as never)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Time:</span>
                  <input
                    type="time"
                    value={prefs.deadlineAlerts[timeKey as keyof typeof prefs.deadlineAlerts] as string}
                    onChange={(e) => updateNested('deadlineAlerts', timeKey as keyof typeof prefs.deadlineAlerts, e.target.value as never)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between mt-2">
              <Toggle
                label="Overdue escalation"
                checked={prefs.deadlineAlerts.overdueEscalation}
                onChange={(v) => updateNested('deadlineAlerts', 'overdueEscalation', v)}
                desc="Re-escalate every N days after deadline"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Every</span>
                <input
                  type="number"
                  min={1} max={7}
                  value={prefs.deadlineAlerts.overdueEscalationIntervalDays}
                  onChange={(e) => updateNested('deadlineAlerts', 'overdueEscalationIntervalDays', Number(e.target.value))}
                  className="w-12 border border-gray-300 rounded px-2 py-1 text-xs text-center"
                />
                <span className="text-xs text-gray-400">days</span>
              </div>
            </div>
            <button
              onClick={() => handleTestAlert('1-Week Reminder')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
            >
              Test Deadline Alert →
            </button>
          </div>
        )}
      </Section>

      {/* Section 2: Task Delegation Alerts */}
      <Section title="📤 Section 2: Task Delegation Alerts">
        <div className="space-y-3">
          <NumberToggle
            label="Alert if task not shared within"
            unit="hours"
            checked={prefs.taskAlerts.unsharedTaskAlert}
            value={prefs.taskAlerts.unsharedAfterHours}
            onToggle={(v) => updateNested('taskAlerts', 'unsharedTaskAlert', v)}
            onValue={(v) => updateNested('taskAlerts', 'unsharedAfterHours', v)}
          />
          <NumberToggle
            label="Alert if task not acknowledged within"
            unit="hours"
            checked={prefs.taskAlerts.undelegatedAlert}
            value={prefs.taskAlerts.undelegatedAfterHours}
            onToggle={(v) => updateNested('taskAlerts', 'undelegatedAlert', v)}
            onValue={(v) => updateNested('taskAlerts', 'undelegatedAfterHours', v)}
          />
          <NumberToggle
            label="Alert for tasks with no deadline, after"
            unit="hours"
            checked={prefs.taskAlerts.noTimelineAlert}
            value={prefs.taskAlerts.noTimelineAfterHours}
            onToggle={(v) => updateNested('taskAlerts', 'noTimelineAlert', v)}
            onValue={(v) => updateNested('taskAlerts', 'noTimelineAfterHours', v)}
          />
        </div>
      </Section>

      {/* Section 3: Follow-Up Requirements */}
      <Section title="⚠️ Section 3: Follow-Up Requirements">
        <NumberToggle
          label="Require follow-up remark for tasks overdue more than"
          unit="days"
          checked={prefs.followUpSettings.requireRemarkOnOverdue}
          value={prefs.followUpSettings.mandatoryRemarkAfterDays}
          onToggle={(v) => updateNested('followUpSettings', 'requireRemarkOnOverdue', v)}
          onValue={(v) => updateNested('followUpSettings', 'mandatoryRemarkAfterDays', v)}
          helpText="Tasks will not be dismissible without a remark after this many days"
        />
        <NumberToggle
          label="Re-remind every"
          unit="hours until remark is added"
          checked={prefs.followUpSettings.requireRemarkOnOverdue}
          value={prefs.followUpSettings.remarkReminderIntervalHours}
          onToggle={() => {}}
          onValue={(v) => updateNested('followUpSettings', 'remarkReminderIntervalHours', v)}
        />
        <button
          onClick={() => handleTestAlert('Mandatory Remark Alert')}
          className="text-xs text-rose-600 hover:text-rose-800 font-medium underline mt-2 block"
        >
          Test Mandatory Remark Alert →
        </button>
      </Section>

      {/* Section 4: Quiet Hours */}
      <Section title="🌙 Section 4: Quiet Hours">
        <Toggle
          label="Enable Quiet Hours"
          checked={prefs.quietHours.enabled}
          onChange={(v) => updateNested('quietHours', 'enabled', v)}
          desc="Alerts scheduled during quiet hours fire at the start of the next active period"
        />
        {prefs.quietHours.enabled && (
          <div className="mt-3 pl-4 border-l-2 border-slate-100 space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">Do not fire alerts between:</span>
              <select
                value={prefs.quietHours.startHour}
                onChange={(e) => updateNested('quietHours', 'startHour', Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{h.toString().padStart(2,'0')}:00</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">and</span>
              <select
                value={prefs.quietHours.endHour}
                onChange={(e) => updateNested('quietHours', 'endHour', Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{h.toString().padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
            <Toggle
              label="Allow CRITICAL alerts to override quiet hours"
              checked={prefs.quietHours.allowCriticalOverride}
              onChange={(v) => updateNested('quietHours', 'allowCriticalOverride', v)}
              desc="Mandatory follow-up alerts always fire, even in quiet hours"
            />
          </div>
        )}
      </Section>

      {/* Section 5: Notification Appearance */}
      <Section title="🔔 Section 5: Notification Appearance">
        <div className="space-y-2">
          <Toggle
            label="Desktop banner notifications"
            checked={prefs.desktopBannerEnabled}
            onChange={(v) => updatePref('desktopBannerEnabled', v)}
            desc="Requires macOS/Windows system permission"
          />
          <Toggle
            label="Sound alerts"
            checked={prefs.soundEnabled}
            onChange={(v) => updatePref('soundEnabled', v)}
          />
          <Toggle
            label="App icon badge count"
            checked={prefs.appBadgeEnabled}
            onChange={(v) => updatePref('appBadgeEnabled', v)}
            desc="Shows total active alerts on the dock/taskbar icon"
          />
        </div>
      </Section>

      {/* Section 6: Test Buttons */}
      <Section title="🧪 Section 6: Test & Preview">
        <div className="grid grid-cols-2 gap-2">
          {[
            { type: '1-Week Reminder', label: 'Fire Sample 1-Week Reminder' },
            { type: 'Overdue Alert', label: 'Fire Sample Overdue Alert' },
            { type: 'Mandatory Remark Alert', label: 'Fire Sample Mandatory Remark' },
            { type: 'Unshared Task Alert', label: 'Fire Sample Unshared Alert' },
          ].map(({ type, label }) => (
            <button
              key={type}
              onClick={() => handleTestAlert(type)}
              className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors text-left font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        {testResult && (
          <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
            {testResult}
          </div>
        )}
      </Section>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors"
        >
          {saved ? '✓ Saved!' : 'Save Alert Settings'}
        </button>
        <button
          onClick={() => setPrefs(DEFAULT_ALERT_PREFERENCES)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange, desc }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string
}): React.JSX.Element {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div
          onClick={() => onChange(!checked)}
          className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-indigo-600' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </div>
      <div>
        <span className="text-sm text-gray-800 font-medium">{label}</span>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function NumberToggle({ label, unit, checked, value, onToggle, onValue, helpText }: {
  label: string; unit: string; checked: boolean; value: number
  onToggle: (v: boolean) => void; onValue: (v: number) => void; helpText?: string
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded text-indigo-600"
        />
        <span className="text-sm text-gray-700">{label}</span>
        <input
          type="number"
          min={1} max={168}
          value={value}
          onChange={(e) => onValue(Number(e.target.value))}
          className="w-14 border border-gray-300 rounded px-2 py-0.5 text-xs text-center"
        />
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
      {helpText && <p className="text-xs text-gray-400 pl-6">{helpText}</p>}
    </div>
  )
}
