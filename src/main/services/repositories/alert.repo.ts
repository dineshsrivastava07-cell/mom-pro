// Alert, Delegation, and FollowUpRemark Repositories
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { Alert, FollowUpRemark, TaskDelegation } from '../../../shared/types/alert.types'

export class AlertRepository {
  constructor(private db: Database.Database) {}

  create(alert: Alert): Alert {
    this.db.prepare(`
      INSERT INTO alerts (id, meeting_code, item_code, meeting_title, meeting_date,
        trigger_type, severity, title, message, detail_message, task_id, task_title,
        assigned_to, assigned_to_email, deadline, scheduled_fire_at, status,
        is_followup_alert, parent_alert_id, requires_followup_remark,
        is_manual_task, was_shared, was_delegated, delegation_acknowledged)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(alert.id, alert.meetingCode, alert.itemCode, alert.meetingTitle, alert.meetingDate,
      alert.triggerType, alert.severity, alert.title, alert.message, alert.detailMessage,
      alert.taskId ?? null, alert.taskTitle ?? null, alert.assignedTo, alert.assignedToEmail ?? null,
      alert.deadline ?? null, alert.scheduledFireAt, alert.status,
      alert.isFollowUpAlert ? 1 : 0, alert.parentAlertId ?? null,
      alert.requiresFollowUpRemark ? 1 : 0,
      alert.isManualTask ? 1 : 0, alert.wasShared ? 1 : 0,
      alert.wasDelegated ? 1 : 0, alert.delegationAcknowledged ? 1 : 0)
    return alert
  }

  createBulk(alerts: Alert[]): void {
    const insert = this.db.transaction((list: Alert[]) => {
      for (const a of list) this.create(a)
    })
    insert(alerts)
  }

  get(id: string): Alert | null {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as Record<string, unknown> | null
    return row ? this.mapRow(row) : null
  }

  getAll(filters?: { status?: string[]; limit?: number }): Alert[] {
    let sql = 'SELECT * FROM alerts WHERE 1=1'
    const params: unknown[] = []
    if (filters?.status?.length) {
      sql += ` AND status IN (${filters.status.map(() => '?').join(',')})`
      params.push(...filters.status)
    }
    sql += ' ORDER BY scheduled_fire_at ASC'
    if (filters?.limit) { sql += ' LIMIT ?'; params.push(filters.limit) }
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map((r) => this.mapRow(r))
  }

  getActive(): Alert[] {
    return this.getAll({ status: ['scheduled', 'fired', 'snoozed'] })
  }

  getScheduled(): Alert[] {
    return this.getAll({ status: ['scheduled'] })
  }

  getMissed(): Alert[] {
    return (this.db.prepare(`
      SELECT * FROM alerts WHERE status = 'scheduled' AND scheduled_fire_at < datetime('now')
    `).all() as Record<string, unknown>[]).map((r) => this.mapRow(r))
  }

  getByTask(taskId: string): Alert[] {
    return (this.db.prepare('SELECT * FROM alerts WHERE task_id = ? ORDER BY scheduled_fire_at').all(taskId) as Record<string, unknown>[]).map((r) => this.mapRow(r))
  }

  getByMeetingCode(mtgCode: string): Alert[] {
    return (this.db.prepare('SELECT * FROM alerts WHERE meeting_code = ? ORDER BY scheduled_fire_at').all(mtgCode) as Record<string, unknown>[]).map((r) => this.mapRow(r))
  }

  update(id: string, partial: Partial<Alert>): void {
    const map: Record<string, string> = {
      status: 'status', firedAt: 'fired_at', snoozeUntil: 'snooze_until',
      snoozeCount: 'snooze_count', requiresFollowUpRemark: 'requires_followup_remark',
      scheduledFireAt: 'scheduled_fire_at'
    }
    const entries = Object.entries(partial).filter(([k]) => map[k])
    if (!entries.length) return
    const set = entries.map(([k]) => `${map[k]} = ?`).join(', ')
    const vals = entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
    this.db.prepare(`UPDATE alerts SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
  }

  resolveChain(taskId: string): void {
    this.db.prepare(`UPDATE alerts SET status = 'resolved', updated_at = datetime('now') WHERE task_id = ?`).run(taskId)
  }

  getActiveCount(): { total: number; critical: number; requiresRemark: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status IN ('scheduled','fired','snoozed')").get() as { c: number }).c
    const critical = (this.db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status IN ('scheduled','fired','snoozed') AND severity IN ('critical','urgent')").get() as { c: number }).c
    const requiresRemark = (this.db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status IN ('scheduled','fired','snoozed') AND requires_followup_remark = 1").get() as { c: number }).c
    return { total, critical, requiresRemark }
  }

  getHistory(limit = 100): Alert[] {
    return (this.db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map((r) => this.mapRow(r))
  }

  private mapRow(row: Record<string, unknown>): Alert {
    const toDate = (v: unknown): Date => new Date(v as string)
    const toOptDate = (v: unknown): Date | undefined => v ? new Date(v as string) : undefined
    return {
      id: row.id as string,
      meetingCode: row.meeting_code as string,
      itemCode: row.item_code as string,
      meetingTitle: row.meeting_title as string,
      meetingDate: row.meeting_date as string,
      triggerType: row.trigger_type as Alert['triggerType'],
      severity: row.severity as Alert['severity'],
      title: row.title as string,
      message: row.message as string,
      detailMessage: (row.detail_message as string | null) ?? '',
      taskId: row.task_id as string | undefined,
      taskTitle: row.task_title as string | undefined,
      assignedTo: row.assigned_to as string,
      assignedToEmail: row.assigned_to_email as string | undefined,
      deadline: toOptDate(row.deadline),
      scheduledFireAt: toDate(row.scheduled_fire_at),
      status: row.status as Alert['status'],
      firedAt: toOptDate(row.fired_at),
      snoozeUntil: toOptDate(row.snooze_until),
      snoozeCount: (row.snooze_count as number | null) ?? 0,
      isFollowUpAlert: Boolean(row.is_followup_alert),
      parentAlertId: row.parent_alert_id as string | undefined,
      requiresFollowUpRemark: Boolean(row.requires_followup_remark),
      isManualTask: Boolean(row.is_manual_task),
      wasShared: Boolean(row.was_shared),
      wasDelegated: Boolean(row.was_delegated),
      delegationAcknowledged: Boolean(row.delegation_acknowledged),
      createdAt: toDate(row.created_at),
      updatedAt: toDate(row.updated_at),
    }
  }
}

export class FollowUpRemarkRepository {
  constructor(private db: Database.Database) {}

  create(remark: Omit<FollowUpRemark, 'id' | 'addedAt'>): FollowUpRemark {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO followup_remarks (id, alert_id, task_id, item_code, remark, remark_by, new_status, new_deadline, impact_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, remark.alertId, remark.taskId, remark.itemCode, remark.remark,
      remark.remarkBy, remark.newStatus, remark.newDeadline ?? null, remark.impactNote ?? null)
    return { id, addedAt: new Date(), ...remark }
  }

  getByTask(taskId: string): FollowUpRemark[] {
    return (this.db.prepare('SELECT * FROM followup_remarks WHERE task_id = ? ORDER BY added_at DESC').all(taskId) as Record<string, unknown>[]).map(this.mapRemark)
  }

  getByAlert(alertId: string): FollowUpRemark | null {
    const r = this.db.prepare('SELECT * FROM followup_remarks WHERE alert_id = ? LIMIT 1').get(alertId) as Record<string, unknown> | null
    if (!r) return null
    return this.mapRemark(r)
  }

  private mapRemark = (r: Record<string, unknown>): FollowUpRemark => ({
    id: r.id as string, alertId: r.alert_id as string, taskId: r.task_id as string,
    itemCode: r.item_code as string, remark: r.remark as string, remarkBy: r.remark_by as string,
    newStatus: r.new_status as FollowUpRemark['newStatus'],
    newDeadline: r.new_deadline ? new Date(r.new_deadline as string) : undefined,
    impactNote: r.impact_note as string | undefined,
    addedAt: new Date(r.added_at as string),
  })
}

export class DelegationRepository {
  constructor(private db: Database.Database) {}

  create(d: Omit<TaskDelegation, 'id' | 'sharedAt'>): TaskDelegation {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO task_delegations (id, task_id, item_code, meeting_code, delegated_to, delegated_to_email,
        delegated_by, delegation_method, delegation_note, has_timeline, deadline, acknowledged)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, d.taskId, d.itemCode, d.meetingCode, d.delegatedTo, d.delegatedToEmail ?? null,
      d.delegatedBy, d.delegationMethod, d.delegationNote ?? null,
      d.hasTimeline ? 1 : 0, d.deadline ?? null, d.acknowledged ? 1 : 0)
    return { id, sharedAt: new Date(), ...d }
  }

  getByTask(taskId: string): TaskDelegation[] {
    return (this.db.prepare('SELECT * FROM task_delegations WHERE task_id = ? ORDER BY shared_at DESC').all(taskId) as Record<string, unknown>[]).map(this.mapRow)
  }

  update(id: string, partial: Partial<TaskDelegation>): void {
    const map: Record<string, string> = { acknowledged: 'acknowledged', acknowledgedAt: 'acknowledged_at' }
    const entries = Object.entries(partial).filter(([k]) => map[k])
    if (!entries.length) return
    const set = entries.map(([k]) => `${map[k]} = ?`).join(', ')
    const vals = entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
    this.db.prepare(`UPDATE task_delegations SET ${set} WHERE id = ?`).run(...vals, id)
  }

  getUnacknowledged(olderThanHours = 24): TaskDelegation[] {
    return (this.db.prepare(`
      SELECT * FROM task_delegations
      WHERE acknowledged = 0 AND shared_at < datetime('now', '-${olderThanHours} hours')
    `).all() as Record<string, unknown>[]).map(this.mapRow)
  }

  private mapRow = (r: Record<string, unknown>): TaskDelegation => ({
    id: r.id as string, taskId: r.task_id as string, itemCode: r.item_code as string,
    meetingCode: r.meeting_code as string, delegatedTo: r.delegated_to as string,
    delegatedToEmail: r.delegated_to_email as string | undefined,
    delegatedBy: r.delegated_by as string, delegationMethod: r.delegation_method as TaskDelegation['delegationMethod'],
    delegationNote: r.delegation_note as string | undefined, hasTimeline: Boolean(r.has_timeline),
    deadline: r.deadline ? new Date(r.deadline as string) : undefined,
    acknowledged: Boolean(r.acknowledged),
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at as string) : undefined,
    sharedAt: new Date(r.shared_at as string),
  })
}
