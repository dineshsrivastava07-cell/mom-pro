// Phase 17 Part C — Alert Scheduler Service
// Uses node-schedule for cron jobs, node-notifier for desktop notifications

import * as schedule from 'node-schedule'
import notifier from 'node-notifier'
import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { Alert, AlertStatus, AlertPreferences, DEFAULT_ALERT_PREFERENCES, FollowUpRemark } from '../../shared/types/alert.types'

// Row type from SQLite
interface AlertRow {
  id: string
  meeting_code: string
  item_code: string
  meeting_title: string
  meeting_date: string
  trigger_type: string
  severity: string
  title: string
  message: string
  detail_message: string
  task_id: string | null
  task_title: string | null
  assigned_to: string
  assigned_to_email: string | null
  deadline: string | null
  scheduled_fire_at: string
  status: string
  fired_at: string | null
  snooze_until: string | null
  snooze_count: number
  is_followup_alert: number
  parent_alert_id: string | null
  followup_remark: string | null
  requires_followup_remark: number
  is_manual_task: number
  was_shared: number
  was_delegated: number
  delegation_acknowledged: number
  created_at: string
  updated_at: string
}

// SNOOZE OPTIONS (minutes)
export const SNOOZE_OPTIONS = [
  { label: '1 Hour',       minutes: 60  },
  { label: '4 Hours',      minutes: 240 },
  { label: 'Tomorrow 9 AM', minutes: -1  },  // Special: next day 9 AM
  { label: '2 Days',       minutes: -2  },  // Special: +2 days 9 AM
]

export class AlertSchedulerService {
  private db: Database.Database
  private jobs: Map<string, schedule.Job> = new Map()
  private prefs: AlertPreferences
  private win: BrowserWindow | null = null
  private iconPath: string

  constructor(db: Database.Database, prefs?: AlertPreferences) {
    this.db = db
    this.prefs = prefs ?? DEFAULT_ALERT_PREFERENCES
    this.iconPath = join(app.getAppPath(), 'resources', 'icon.png')
  }

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  updatePreferences(prefs: AlertPreferences): void {
    this.prefs = prefs
  }

  // ─── INITIALIZATION ────────────────────────────────────────────────────────
  async initialize(): Promise<void> {
    console.log('[AlertScheduler] Initializing...')

    // 1. Catch up any missed alerts while app was closed
    await this.catchUpMissedAlerts()

    // 2. Load and re-register all scheduled alerts
    const scheduledAlerts = this.db
      .prepare(`
        SELECT * FROM alerts
        WHERE status = 'scheduled'
          AND scheduled_fire_at > datetime('now')
        ORDER BY scheduled_fire_at ASC
      `)
      .all() as AlertRow[]

    for (const row of scheduledAlerts) {
      this.scheduleAlert(this.rowToAlert(row))
    }

    // 3. Background cron: check every 5 minutes for new alerts
    schedule.scheduleJob('alert-poller', '*/5 * * * *', () => {
      this.pollNewAlerts()
    })

    // 4. Daily 9 AM: overdue escalation check
    schedule.scheduleJob('overdue-check', '0 9 * * *', () => {
      this.generateOverdueEscalations()
    })

    // 5. Every 6 hours: undelegated task check
    schedule.scheduleJob('delegation-check', '0 */6 * * *', () => {
      this.checkUndelegatedTasks()
    })

    console.log(`[AlertScheduler] Registered ${scheduledAlerts.length} alerts. Running.`)
  }

  // ─── SCHEDULE A SINGLE ALERT ───────────────────────────────────────────────
  scheduleAlert(alert: Alert): void {
    if (alert.scheduledFireAt <= new Date()) {
      // Already past — fire immediately
      this.fireAlert(alert)
      return
    }
    const job = schedule.scheduleJob(
      `alert-${alert.id}`,
      alert.scheduledFireAt,
      () => this.fireAlert(alert)
    )
    if (job) this.jobs.set(alert.id, job)
  }

  // ─── FIRE AN ALERT ────────────────────────────────────────────────────────
  async fireAlert(alert: Alert): Promise<void> {
    // Check if task is already resolved
    if (alert.taskId) {
      const task = this.db
        .prepare('SELECT status FROM tasks WHERE id = ?')
        .get(alert.taskId) as { status: string } | undefined

      if (!task) {
        this.updateAlertStatus(alert.id, 'resolved')
        return
      }
      if (task.status === 'completed' || task.status === 'cancelled') {
        this.updateAlertStatus(alert.id, 'resolved')
        return
      }
    }

    // Check quiet hours
    if (this.isInQuietHours() && !this.shouldOverrideQuietHours(alert)) {
      const endOfQuietHours = this.getEndOfQuietHours()
      this.db
        .prepare(`UPDATE alerts SET scheduled_fire_at = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(endOfQuietHours.toISOString(), alert.id)
      this.scheduleAlert({ ...alert, scheduledFireAt: endOfQuietHours })
      return
    }

    // Send desktop notification
    if (this.prefs.desktopBannerEnabled) {
      const actions = this.getNotificationActions(alert.triggerType)
      notifier.notify(
        {
          title: alert.title,
          message: alert.message,
          icon: this.iconPath,
          sound: this.prefs.soundEnabled,
          wait: false,
          actions
        },
        (_err, _response, metadata) => {
          if (metadata?.activationValue) {
            this.handleNotificationAction(alert, metadata.activationValue as string)
          }
        }
      )
    }

    // Update DB
    this.db
      .prepare(`
        UPDATE alerts
        SET status = 'fired', fired_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(alert.id)

    // Notify renderer
    this.emitToRenderer('alert:fired', { alertId: alert.id, alert })

    // Schedule escalation for overdue (re-fire every N days)
    if (
      alert.triggerType === 'deadline_overdue' &&
      this.prefs.deadlineAlerts.overdueEscalation
    ) {
      this.scheduleOverdueEscalation(alert)
    }
  }

  // ─── SNOOZE ───────────────────────────────────────────────────────────────
  snoozeAlert(alertId: string, snoozeMinutes: number): void {
    const snoozeUntil = snoozeMinutes > 0
      ? new Date(Date.now() + snoozeMinutes * 60_000)
      : snoozeMinutes === -1
        ? AlertSchedulerService.tomorrowAt9AM()
        : AlertSchedulerService.inTwoDaysAt9AM()

    const row = this.db
      .prepare('SELECT snooze_count FROM alerts WHERE id = ?')
      .get(alertId) as { snooze_count: number } | undefined

    const newCount = (row?.snooze_count ?? 0) + 1

    this.db
      .prepare(`
        UPDATE alerts
        SET status = 'snoozed', snooze_until = ?, snooze_count = ?,
            scheduled_fire_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(snoozeUntil.toISOString(), newCount, snoozeUntil.toISOString(), alertId)

    // Cancel existing job and re-schedule
    this.cancelJob(alertId)
    const alert = this.getAlertById(alertId)
    if (alert) {
      this.scheduleAlert({ ...alert, scheduledFireAt: snoozeUntil, status: 'snoozed' })
    }

    // Escalate after 3 snoozes
    if (newCount >= 3) {
      this.emitToRenderer('alert:snooze-escalation', { alertId, snoozeCount: newCount })
    }
  }

  // ─── DISMISS ─────────────────────────────────────────────────────────────
  dismissAlert(alertId: string): boolean {
    const row = this.db
      .prepare('SELECT requires_followup_remark FROM alerts WHERE id = ?')
      .get(alertId) as { requires_followup_remark: number } | undefined

    // Cannot dismiss mandatory remark alerts without a remark
    if (row?.requires_followup_remark) {
      this.emitToRenderer('alert:dismiss-blocked', { alertId })
      return false
    }

    this.updateAlertStatus(alertId, 'dismissed')
    this.cancelJob(alertId)
    return true
  }

  // ─── RESOLVE CHAIN (when task marked done) ────────────────────────────────
  resolveAlertChain(taskId: string): void {
    const alerts = this.db
      .prepare(`SELECT id FROM alerts WHERE task_id = ? AND status IN ('scheduled','snoozed','fired')`)
      .all(taskId) as { id: string }[]

    for (const { id } of alerts) {
      this.cancelJob(id)
      this.updateAlertStatus(id, 'resolved')
    }

    this.emitToRenderer('alert:chain-resolved', { taskId, resolvedCount: alerts.length })
  }

  // ─── ADD FOLLOW-UP REMARK ─────────────────────────────────────────────────
  addFollowUpRemark(
    alertId: string,
    remark: Omit<FollowUpRemark, 'id' | 'addedAt'>
  ): FollowUpRemark {
    const id = uuidv4()
    const now = new Date().toISOString()

    this.db
      .prepare(`
        INSERT INTO followup_remarks
          (id, alert_id, task_id, item_code, remark, remark_by, new_status, new_deadline, impact_note, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        remark.alertId,
        remark.taskId,
        remark.itemCode,
        remark.remark,
        remark.remarkBy,
        remark.newStatus,
        remark.newDeadline?.toISOString() ?? null,
        remark.impactNote ?? null,
        now
      )

    // Update task status and deadline if changed
    if (remark.newDeadline) {
      this.db
        .prepare(`UPDATE tasks SET deadline = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(remark.newDeadline.toISOString(), remark.taskId)
    }
    this.db
      .prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(remark.newStatus, remark.taskId)

    // Remove mandatory remark requirement from alert — now can be dismissed
    this.db
      .prepare(`
        UPDATE alerts
        SET requires_followup_remark = 0, followup_remark = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(remark.remark, alertId)

    // Auto-resolve if completed/cancelled
    if (remark.newStatus === 'completed' || remark.newStatus === 'cancelled') {
      this.resolveAlertChain(remark.taskId)
    }

    this.emitToRenderer('alert:remark-added', { alertId, taskId: remark.taskId })

    return { ...remark, id, addedAt: new Date() }
  }

  // ─── OVERDUE ESCALATION (daily 9 AM cron) ─────────────────────────────────
  generateOverdueEscalations(): void {
    const overdueTasks = this.db
      .prepare(`
        SELECT t.*, m.title AS meeting_title, m.meeting_code, m.scheduled_start
        FROM tasks t
        JOIN meetings m ON t.meeting_id = m.id
        WHERE t.status NOT IN ('completed','cancelled')
          AND t.deadline IS NOT NULL
          AND date(t.deadline) < date('now')
      `)
      .all() as Array<Record<string, unknown>>

    for (const row of overdueTasks) {
      const deadline = new Date(row.deadline as string)
      const daysPastDue = Math.floor(
        (Date.now() - deadline.getTime()) / (1000 * 60 * 60 * 24)
      )

      const mandatoryDays = this.prefs.followUpSettings.mandatoryRemarkAfterDays

      if (daysPastDue >= mandatoryDays) {
        // Check if a mandatory alert already exists and was NOT remarked
        const existing = this.db
          .prepare(`
            SELECT id FROM alerts
            WHERE task_id = ?
              AND trigger_type = 'followup_mandatory'
              AND status NOT IN ('resolved','dismissed')
          `)
          .get(row.id as string)

        if (!existing) {
          // Build alert data and fire
          this.emitToRenderer('alert:mandatory-followup-needed', {
            taskId: row.id,
            daysPastDue,
            meetingCode: row.meeting_code
          })
        }
      }

      // Re-fire overdue alert every N days
      const intervalDays = this.prefs.deadlineAlerts.overdueEscalationIntervalDays
      if (daysPastDue > 0 && daysPastDue % intervalDays === 0) {
        this.emitToRenderer('alert:overdue-escalation', {
          taskId: row.id,
          daysPastDue,
          meetingCode: row.meeting_code
        })
      }
    }
  }

  // ─── UNDELEGATED CHECK (every 6 hours) ───────────────────────────────────
  checkUndelegatedTasks(): void {
    // Tasks shared but never acknowledged after 48h
    const undelegated = this.db
      .prepare(`
        SELECT td.*, t.title AS task_title, t.assigned_to, t.item_code
        FROM task_delegations td
        JOIN tasks t ON td.task_id = t.id
        WHERE td.acknowledged = 0
          AND datetime(td.shared_at, '+48 hours') < datetime('now')
          AND t.status NOT IN ('completed','cancelled')
      `)
      .all() as Array<Record<string, unknown>>

    for (const del of undelegated) {
      this.emitToRenderer('alert:task-undelegated', {
        taskId: del.task_id,
        delegationId: del.id,
        assignedTo: del.delegated_to,
        meetingCode: del.meeting_code
      })
    }

    // Tasks never shared (wasShared=0, created > prefs.unsharedAfterHours ago)
    const hours = this.prefs.taskAlerts.unsharedAfterHours
    const unshared = this.db
      .prepare(`
        SELECT t.id, t.meeting_code, t.assigned_to
        FROM tasks t
        WHERE t.was_shared = 0
          AND t.status NOT IN ('completed','cancelled')
          AND datetime(t.created_at, '+${hours} hours') < datetime('now')
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
            WHERE a.task_id = t.id
              AND a.trigger_type = 'task_unshared'
              AND a.status NOT IN ('resolved','dismissed')
          )
      `)
      .all() as Array<Record<string, unknown>>

    for (const task of unshared) {
      this.emitToRenderer('alert:task-unshared', { taskId: task.id })
    }
  }

  // ─── CATCH UP MISSED ALERTS (on startup) ─────────────────────────────────
  async catchUpMissedAlerts(): Promise<void> {
    const missed = this.db
      .prepare(`
        SELECT * FROM alerts
        WHERE status = 'scheduled'
          AND scheduled_fire_at < datetime('now')
        ORDER BY scheduled_fire_at ASC
      `)
      .all() as AlertRow[]

    if (missed.length === 0) return

    if (missed.length === 1) {
      // Fire single missed alert with prefix
      const alert = this.rowToAlert(missed[0])
      alert.title = `[Missed] ${alert.title}`
      await this.fireAlert(alert)
    } else {
      // Bundle multiple missed alerts into one notification
      notifier.notify({
        title: `📋 MOM Pro — ${missed.length} Missed Alerts`,
        message: `You missed ${missed.length} alerts while the app was closed. Click to review.`,
        icon: this.iconPath,
        sound: this.prefs.soundEnabled
      })
      // Mark all as fired
      this.db
        .prepare(`
          UPDATE alerts
          SET status = 'fired', fired_at = datetime('now'), updated_at = datetime('now')
          WHERE status = 'scheduled' AND scheduled_fire_at < datetime('now')
        `)
        .run()
      // Open Alert Center in renderer
      this.emitToRenderer('alert:missed-bundle', { count: missed.length })
    }
  }

  // ─── POLL FOR NEWLY SCHEDULED ALERTS ─────────────────────────────────────
  private pollNewAlerts(): void {
    const newAlerts = this.db
      .prepare(`
        SELECT * FROM alerts
        WHERE status = 'scheduled'
          AND scheduled_fire_at > datetime('now')
          AND id NOT IN (${[...this.jobs.keys()].map(() => '?').join(',') || "''"})
      `)
      .all(...[...this.jobs.keys()]) as AlertRow[]

    for (const row of newAlerts) {
      this.scheduleAlert(this.rowToAlert(row))
    }
  }

  // ─── OVERDUE RE-SCHEDULE ──────────────────────────────────────────────────
  private scheduleOverdueEscalation(alert: Alert): void {
    const intervalDays = this.prefs.deadlineAlerts.overdueEscalationIntervalDays
    const nextFire = new Date()
    nextFire.setDate(nextFire.getDate() + intervalDays)
    nextFire.setHours(9, 0, 0, 0)

    const newAlert: Alert = {
      ...alert,
      id: uuidv4(),
      scheduledFireAt: nextFire,
      status: 'scheduled',
      parentAlertId: alert.id,
      snoozeCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.db
      .prepare(`
        INSERT INTO alerts (
          id, meeting_code, item_code, meeting_title, meeting_date,
          trigger_type, severity, title, message, detail_message,
          task_id, task_title, assigned_to, deadline, scheduled_fire_at,
          status, snooze_count, is_followup_alert, parent_alert_id,
          requires_followup_remark, is_manual_task, was_shared, was_delegated,
          delegation_acknowledged, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .run(
        newAlert.id, newAlert.meetingCode, newAlert.itemCode, newAlert.meetingTitle,
        newAlert.meetingDate, newAlert.triggerType, newAlert.severity,
        newAlert.title, newAlert.message, newAlert.detailMessage,
        newAlert.taskId ?? null, newAlert.taskTitle ?? null, newAlert.assignedTo,
        newAlert.deadline?.toISOString() ?? null, newAlert.scheduledFireAt.toISOString(),
        'scheduled', 0, 1, newAlert.parentAlertId ?? null,
        1, newAlert.isManualTask ? 1 : 0,
        newAlert.wasShared ? 1 : 0, newAlert.wasDelegated ? 1 : 0, 0
      )

    this.scheduleAlert(newAlert)
  }

  // ─── QUIET HOURS ──────────────────────────────────────────────────────────
  private isInQuietHours(): boolean {
    if (!this.prefs.quietHours.enabled) return false
    const h = new Date().getHours()
    const { startHour, endHour } = this.prefs.quietHours
    if (startHour > endHour) {
      return h >= startHour || h < endHour
    }
    return h >= startHour && h < endHour
  }

  private shouldOverrideQuietHours(alert: Alert): boolean {
    return (
      this.prefs.quietHours.allowCriticalOverride &&
      (alert.severity === 'critical' || alert.requiresFollowUpRemark)
    )
  }

  private getEndOfQuietHours(): Date {
    const d = new Date()
    d.setHours(this.prefs.quietHours.endHour, 0, 0, 0)
    if (d <= new Date()) d.setDate(d.getDate() + 1)
    return d
  }

  // ─── NOTIFICATION ACTIONS BY TYPE ─────────────────────────────────────────
  private getNotificationActions(triggerType: string): string[] {
    const actions: Record<string, string[]> = {
      deadline_1week:     ['View Task', 'Snooze 2 Days', 'Mark Done'],
      deadline_2days:     ['View Task', 'Snooze 1 Day',  'Mark Done'],
      deadline_1day:      ['View Task', 'Snooze 4 Hours', 'Mark Done'],
      deadline_overdue:   ['Mark Done Now', 'Add Remark', 'Reschedule'],
      task_unshared:      ['Send Email Now', 'Mark Verbally Told'],
      followup_mandatory: ['Add Remark (Required)'],
      no_timeline_set:    ['Set Deadline Now', 'Dismiss'],
      task_undelegated:   ['Re-send Email', 'Mark Acknowledged']
    }
    return actions[triggerType] ?? ['View', 'Dismiss']
  }

  private handleNotificationAction(alert: Alert, action: string): void {
    switch (action) {
      case 'Mark Done Now':
        if (alert.taskId) this.resolveAlertChain(alert.taskId)
        break
      case 'Snooze 2 Days':
        this.snoozeAlert(alert.id, -2)
        break
      case 'Snooze 1 Day':
        this.snoozeAlert(alert.id, -1)
        break
      case 'Snooze 4 Hours':
        this.snoozeAlert(alert.id, 240)
        break
      default:
        this.emitToRenderer('alert:action', { alertId: alert.id, action })
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private updateAlertStatus(id: string, status: AlertStatus): void {
    this.db
      .prepare(`UPDATE alerts SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id)
  }

  private cancelJob(alertId: string): void {
    const job = this.jobs.get(alertId)
    if (job) {
      job.cancel()
      this.jobs.delete(alertId)
    }
  }

  private getAlertById(id: string): Alert | null {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined
    return row ? this.rowToAlert(row) : null
  }

  private emitToRenderer(channel: string, data: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data)
    }
  }

  private rowToAlert(row: AlertRow): Alert {
    return {
      id: row.id,
      meetingCode: row.meeting_code,
      itemCode: row.item_code,
      meetingTitle: row.meeting_title,
      meetingDate: row.meeting_date,
      triggerType: row.trigger_type as Alert['triggerType'],
      severity: row.severity as Alert['severity'],
      title: row.title,
      message: row.message,
      detailMessage: row.detail_message,
      taskId: row.task_id ?? undefined,
      taskTitle: row.task_title ?? undefined,
      assignedTo: row.assigned_to,
      assignedToEmail: row.assigned_to_email ?? undefined,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      scheduledFireAt: new Date(row.scheduled_fire_at),
      status: row.status as Alert['status'],
      firedAt: row.fired_at ? new Date(row.fired_at) : undefined,
      snoozeUntil: row.snooze_until ? new Date(row.snooze_until) : undefined,
      snoozeCount: row.snooze_count,
      isFollowUpAlert: !!row.is_followup_alert,
      parentAlertId: row.parent_alert_id ?? undefined,
      followUpRemark: row.followup_remark ?? undefined,
      requiresFollowUpRemark: !!row.requires_followup_remark,
      isManualTask: !!row.is_manual_task,
      wasShared: !!row.was_shared,
      wasDelegated: !!row.was_delegated,
      delegationAcknowledged: !!row.delegation_acknowledged,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  // Get alert summary counts
  getAlertSummary(): { total: number; critical: number; requiresRemark: number } {
    const result = this.db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
          SUM(CASE WHEN requires_followup_remark = 1 THEN 1 ELSE 0 END) AS requires_remark
        FROM alerts
        WHERE status IN ('scheduled', 'fired', 'snoozed')
      `)
      .get() as { total: number; critical: number; requires_remark: number }

    return {
      total: result.total,
      critical: result.critical,
      requiresRemark: result.requires_remark
    }
  }

  shutdown(): void {
    schedule.gracefulShutdown()
  }

  static tomorrowAt9AM(): Date {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }

  static inTwoDaysAt9AM(): Date {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    d.setHours(9, 0, 0, 0)
    return d
  }
}
