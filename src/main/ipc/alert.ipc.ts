// IPC Handlers — Alert Engine (Phase 17-19)

import { ipcMain } from 'electron'
import { AlertSchedulerService } from '../services/alert-scheduler.service'
import { DelegationService } from '../services/delegation.service'
import { AlertFactoryService } from '../services/alert-factory.service'
import { getDB } from '../db/database'
import { AlertPreferences, FollowUpRemark } from '../../shared/types/alert.types'
import { Task, Meeting } from '../../shared/types/meeting.types'

let schedulerService: AlertSchedulerService | null = null
let delegationService: DelegationService | null = null
let factoryService: AlertFactoryService | null = null

export function initAlertIPC(scheduler: AlertSchedulerService): void {
  schedulerService = scheduler
  const db = getDB()
  delegationService = new DelegationService(db)
  factoryService = new AlertFactoryService()

  // ─── ALERT CRUD ─────────────────────────────────────────────────────────

  ipcMain.handle('alerts:get-all', (_event, filters?: {
    status?: string[]
    severity?: string[]
    meetingCode?: string
    limit?: number
  }) => {
    const db = getDB()
    let query = 'SELECT * FROM alerts'
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.status?.length) {
      conditions.push(`status IN (${filters.status.map(() => '?').join(',')})`)
      params.push(...filters.status)
    }
    if (filters?.severity?.length) {
      conditions.push(`severity IN (${filters.severity.map(() => '?').join(',')})`)
      params.push(...filters.severity)
    }
    if (filters?.meetingCode) {
      conditions.push('meeting_code = ?')
      params.push(filters.meetingCode)
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
    query += ' ORDER BY scheduled_fire_at DESC'
    if (filters?.limit) query += ` LIMIT ${filters.limit}`

    return db.prepare(query).all(...params)
  })

  ipcMain.handle('alerts:get-summary', () => {
    return schedulerService?.getAlertSummary() ?? { total: 0, critical: 0, requiresRemark: 0 }
  })

  ipcMain.handle('alerts:get-active', () => {
    const db = getDB()
    return db
      .prepare(`
        SELECT * FROM alerts
        WHERE status IN ('scheduled','fired','snoozed')
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
          scheduled_fire_at ASC
      `)
      .all()
  })

  ipcMain.handle('alerts:snooze', (_event, alertId: string, minutes: number) => {
    schedulerService?.snoozeAlert(alertId, minutes)
    return { success: true }
  })

  ipcMain.handle('alerts:dismiss', (_event, alertId: string) => {
    const dismissed = schedulerService?.dismissAlert(alertId) ?? false
    return { success: dismissed }
  })

  ipcMain.handle('alerts:resolve-chain', (_event, taskId: string) => {
    schedulerService?.resolveAlertChain(taskId)
    return { success: true }
  })

  ipcMain.handle('alerts:add-remark', (_event, alertId: string, remark: Omit<FollowUpRemark, 'id' | 'addedAt'>) => {
    return schedulerService?.addFollowUpRemark(alertId, remark)
  })

  ipcMain.handle('alerts:get-preferences', () => {
    const db = getDB()
    const row = db.prepare('SELECT preferences_json FROM alert_preferences WHERE id = ?').get('default') as
      { preferences_json: string } | undefined
    if (!row) return null
    return JSON.parse(row.preferences_json)
  })

  ipcMain.handle('alerts:save-preferences', (_event, prefs: AlertPreferences) => {
    const db = getDB()
    db.prepare(`
      INSERT INTO alert_preferences (id, preferences_json, updated_at)
      VALUES ('default', ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = datetime('now')
    `).run(JSON.stringify(prefs))
    schedulerService?.updatePreferences(prefs)
    factoryService?.updatePreferences(prefs)
    return { success: true }
  })

  ipcMain.handle('alerts:generate-for-task', (_event, task: Task, meeting: Meeting) => {
    if (!factoryService) return []
    const alerts = factoryService.generateAlertsForTask(task, meeting)

    // Persist to DB and schedule
    const db = getDB()
    for (const alert of alerts) {
      db.prepare(`
        INSERT OR IGNORE INTO alerts (
          id, meeting_code, item_code, meeting_title, meeting_date,
          trigger_type, severity, title, message, detail_message,
          task_id, task_title, assigned_to, assigned_to_email, deadline,
          scheduled_fire_at, status, snooze_count, is_followup_alert,
          requires_followup_remark, is_manual_task, was_shared, was_delegated,
          delegation_acknowledged, parent_alert_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        alert.id, alert.meetingCode, alert.itemCode, alert.meetingTitle,
        alert.meetingDate, alert.triggerType, alert.severity,
        alert.title, alert.message, alert.detailMessage,
        alert.taskId ?? null, alert.taskTitle ?? null, alert.assignedTo,
        alert.assignedToEmail ?? null, alert.deadline?.toISOString() ?? null,
        alert.scheduledFireAt.toISOString(), 'scheduled', 0,
        alert.isFollowUpAlert ? 1 : 0, alert.requiresFollowUpRemark ? 1 : 0,
        alert.isManualTask ? 1 : 0, alert.wasShared ? 1 : 0,
        alert.wasDelegated ? 1 : 0, 0, alert.parentAlertId ?? null
      )
      schedulerService?.scheduleAlert(alert)
    }
    return alerts
  })

  ipcMain.handle('alerts:get-followup-remarks', (_event, taskId: string) => {
    const db = getDB()
    return db.prepare('SELECT * FROM followup_remarks WHERE task_id = ? ORDER BY added_at DESC').all(taskId)
  })

  // ─── DELEGATION IPC ─────────────────────────────────────────────────────

  ipcMain.handle('delegation:share-email', (_event, task: Task, meeting: Meeting, opts: {
    recipientEmail: string; note?: string; deadline?: string
  }) => {
    return delegationService?.shareTaskViaEmail(task, meeting, {
      ...opts,
      deadline: opts.deadline ? new Date(opts.deadline) : undefined
    })
  })

  ipcMain.handle('delegation:share-manual', (_event, task: Task, meeting: Meeting, method: string, note: string, deadline?: string) => {
    return delegationService?.shareTaskManually(
      task, meeting,
      method as import('../../shared/types/alert.types').TaskDelegation['delegationMethod'],
      note,
      deadline ? new Date(deadline) : undefined
    )
  })

  ipcMain.handle('delegation:acknowledge', (_event, delegationId: string, acknowledgedBy: string) => {
    delegationService?.markTaskAcknowledged(delegationId, acknowledgedBy)
    schedulerService?.resolveAlertChain(delegationId)
    return { success: true }
  })

  ipcMain.handle('delegation:get-status', (_event, taskId: string) => {
    return delegationService?.getDelegationStatus(taskId)
  })

  ipcMain.handle('delegation:get-unshared', () => {
    return delegationService?.getUnsharedTasks()
  })

  ipcMain.handle('delegation:get-pending-ack', () => {
    return delegationService?.getPendingAcknowledgmentTasks()
  })

  ipcMain.handle('delegation:bulk-preview', (_event, meetingId: string) => {
    return delegationService?.bulkSharePreview(meetingId)
  })
}
