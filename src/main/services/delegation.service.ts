// Phase 19 — Task Delegation & Sharing Tracker Service

import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { TaskDelegation } from '../../shared/types/alert.types'
import { Task, Meeting } from '../../shared/types/meeting.types'

export interface DelegationStatusReport {
  task: Task
  delegations: TaskDelegation[]
  isShared: boolean
  isDelegated: boolean
  isAcknowledged: boolean
  daysSinceShared: number
  hasTimeline: boolean
  alertsActive: { id: string; triggerType: string; severity: string }[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface BulkShareResult {
  sent: number
  failed: number
  recipients: string[]
  preview: { assignee: string; taskCount: number; email?: string }[]
}

export class DelegationService {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ─── SHARE VIA EMAIL ──────────────────────────────────────────────────────
  // (Email sending is handled by GmailService; this records the delegation)
  shareTaskViaEmail(
    task: Task,
    meeting: Meeting,
    emailOptions: {
      recipientEmail: string
      note?: string
      deadline?: Date
    }
  ): TaskDelegation {
    const delegation = this.createDelegation({
      taskId: task.id,
      itemCode: task.itemCode?.full ?? '',
      meetingCode: meeting.meetingCode,
      delegatedTo: task.assignedTo,
      delegatedToEmail: emailOptions.recipientEmail,
      delegatedBy: meeting.organizer,
      delegationMethod: 'email',
      delegationNote: emailOptions.note,
      hasTimeline: !!emailOptions.deadline,
      deadline: emailOptions.deadline
    })

    // Mark task as shared + delegated
    this.db
      .prepare(`
        UPDATE tasks
        SET was_shared = 1, was_delegated = 1, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(task.id)

    return delegation
  }

  // ─── SHARE MANUALLY ───────────────────────────────────────────────────────
  shareTaskManually(
    task: Task,
    meeting: Meeting,
    method: TaskDelegation['delegationMethod'],
    note: string,
    deadline?: Date
  ): TaskDelegation {
    const delegation = this.createDelegation({
      taskId: task.id,
      itemCode: task.itemCode?.full ?? '',
      meetingCode: meeting.meetingCode,
      delegatedTo: task.assignedTo,
      delegatedToEmail: task.assignedToEmail,
      delegatedBy: meeting.organizer,
      delegationMethod: method,
      delegationNote: note,
      hasTimeline: !!deadline,
      deadline
    })

    this.db
      .prepare(`
        UPDATE tasks
        SET was_shared = 1, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(task.id)

    return delegation
  }

  // ─── MARK ACKNOWLEDGED ────────────────────────────────────────────────────
  markTaskAcknowledged(delegationId: string, acknowledgedBy: string): void {
    const delegation = this.db
      .prepare('SELECT task_id FROM task_delegations WHERE id = ?')
      .get(delegationId) as { task_id: string } | undefined

    if (!delegation) return

    this.db
      .prepare(`
        UPDATE task_delegations
        SET acknowledged = 1, acknowledged_at = datetime('now')
        WHERE id = ?
      `)
      .run(delegationId)

    // Append to task edit history
    const task = this.db
      .prepare('SELECT edit_history FROM tasks WHERE id = ?')
      .get(delegation.task_id) as { edit_history: string } | undefined

    if (task) {
      const history = JSON.parse(task.edit_history || '[]')
      history.push({
        field: 'acknowledged',
        oldValue: false,
        newValue: true,
        editedBy: acknowledgedBy,
        editedAt: new Date().toISOString(),
        note: `Acknowledged by ${acknowledgedBy}`
      })
      this.db
        .prepare(`UPDATE tasks SET edit_history = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(history), delegation.task_id)
    }
  }

  // ─── GET DELEGATION STATUS REPORT ────────────────────────────────────────
  getDelegationStatus(taskId: string): DelegationStatusReport | null {
    const taskRow = this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskId) as Record<string, unknown> | undefined

    if (!taskRow) return null

    const delegations = this.db
      .prepare('SELECT * FROM task_delegations WHERE task_id = ? ORDER BY shared_at DESC')
      .all(taskId) as Record<string, unknown>[]

    const activeAlerts = this.db
      .prepare(`
        SELECT id, trigger_type, severity FROM alerts
        WHERE task_id = ? AND status IN ('scheduled','fired','snoozed')
      `)
      .all(taskId) as { id: string; trigger_type: string; severity: string }[]

    const isShared = !!(taskRow.was_shared as number)
    const isDelegated = !!(taskRow.was_delegated as number)
    const latestDel = delegations[0] as Record<string, unknown> | undefined
    const isAcknowledged = latestDel ? !!(latestDel.acknowledged as number) : false
    const hasTimeline = !!(taskRow.deadline as string)

    const sharedAt = latestDel?.shared_at
      ? new Date(latestDel.shared_at as string)
      : null
    const daysSinceShared = sharedAt
      ? Math.floor((Date.now() - sharedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    const deadlinePassed =
      taskRow.deadline
        ? new Date(taskRow.deadline as string) < new Date()
        : false

    // Risk level calculation
    let riskLevel: DelegationStatusReport['riskLevel'] = 'low'
    if (!isShared && deadlinePassed) {
      riskLevel = 'critical'
    } else if (isShared && deadlinePassed && daysSinceShared > 3) {
      riskLevel = 'critical'
    } else if (!isShared) {
      riskLevel = 'high'
    } else if (!isAcknowledged || !hasTimeline) {
      riskLevel = 'medium'
    }

    const task: Task = this.rowToTask(taskRow)
    const formattedDelegations: TaskDelegation[] = delegations.map((d) =>
      this.rowToDelegation(d)
    )

    return {
      task,
      delegations: formattedDelegations,
      isShared,
      isDelegated,
      isAcknowledged,
      daysSinceShared,
      hasTimeline,
      alertsActive: activeAlerts.map((a) => ({
        id: a.id,
        triggerType: a.trigger_type,
        severity: a.severity
      })),
      riskLevel
    }
  }

  // ─── BULK SHARE ALL UNSHARED TASKS IN A MEETING ───────────────────────────
  bulkSharePreview(meetingId: string): BulkShareResult['preview'] {
    const rows = this.db
      .prepare(`
        SELECT assigned_to, assigned_to_email, COUNT(*) AS task_count
        FROM tasks
        WHERE meeting_id = ? AND was_shared = 0
          AND status NOT IN ('completed','cancelled')
        GROUP BY assigned_to, assigned_to_email
      `)
      .all(meetingId) as { assigned_to: string; assigned_to_email: string | null; task_count: number }[]

    return rows.map((r) => ({
      assignee: r.assigned_to,
      taskCount: r.task_count,
      email: r.assigned_to_email ?? undefined
    }))
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private createDelegation(params: {
    taskId: string
    itemCode: string
    meetingCode: string
    delegatedTo: string
    delegatedToEmail?: string
    delegatedBy: string
    delegationMethod: TaskDelegation['delegationMethod']
    delegationNote?: string
    hasTimeline: boolean
    deadline?: Date
  }): TaskDelegation {
    const id = uuidv4()
    const now = new Date()

    this.db
      .prepare(`
        INSERT INTO task_delegations
          (id, task_id, item_code, meeting_code, delegated_to, delegated_to_email,
           delegated_by, delegation_method, delegation_note, has_timeline, deadline,
           acknowledged, shared_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
      `)
      .run(
        id,
        params.taskId,
        params.itemCode,
        params.meetingCode,
        params.delegatedTo,
        params.delegatedToEmail ?? null,
        params.delegatedBy,
        params.delegationMethod,
        params.delegationNote ?? null,
        params.hasTimeline ? 1 : 0,
        params.deadline?.toISOString() ?? null
      )

    return {
      id,
      taskId: params.taskId,
      itemCode: params.itemCode,
      meetingCode: params.meetingCode,
      delegatedTo: params.delegatedTo,
      delegatedToEmail: params.delegatedToEmail,
      delegatedBy: params.delegatedBy,
      delegationMethod: params.delegationMethod,
      delegationNote: params.delegationNote,
      hasTimeline: params.hasTimeline,
      deadline: params.deadline,
      acknowledged: false,
      sharedAt: now
    }
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      meetingId: row.meeting_id as string,
      meetingCode: row.meeting_code as string,
      title: row.title as string,
      assignedTo: row.assigned_to as string,
      assignedToEmail: row.assigned_to_email as string | undefined,
      assignedBy: row.assigned_by as string | undefined,
      mtgCodeRef: row.mtg_code_ref as string,
      deadline: row.deadline ? new Date(row.deadline as string) : undefined,
      priority: (row.priority as Task['priority']) ?? 'medium',
      status: (row.status as Task['status']) ?? 'pending',
      discussedAt: row.discussed_at as string | undefined,
      wasShared: !!(row.was_shared as number),
      wasDelegated: !!(row.was_delegated as number),
      isManual: !!(row.is_manual as number),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string)
    }
  }

  private rowToDelegation(row: Record<string, unknown>): TaskDelegation {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      itemCode: row.item_code as string,
      meetingCode: row.meeting_code as string,
      delegatedTo: row.delegated_to as string,
      delegatedToEmail: row.delegated_to_email as string | undefined,
      delegatedBy: row.delegated_by as string,
      delegationMethod: row.delegation_method as TaskDelegation['delegationMethod'],
      delegationNote: row.delegation_note as string | undefined,
      hasTimeline: !!(row.has_timeline as number),
      deadline: row.deadline ? new Date(row.deadline as string) : undefined,
      acknowledged: !!(row.acknowledged as number),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at as string) : undefined,
      sharedAt: new Date(row.shared_at as string)
    }
  }

  // Get all unshared tasks across all meetings (for Delegation Dashboard)
  getUnsharedTasks(): Task[] {
    return (
      this.db
        .prepare(`SELECT * FROM tasks WHERE was_shared = 0 AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC`)
        .all() as Record<string, unknown>[]
    ).map((r) => this.rowToTask(r))
  }

  // Get pending acknowledgment tasks
  getPendingAcknowledgmentTasks(): { task: Task; delegation: TaskDelegation; daysPending: number }[] {
    const rows = this.db
      .prepare(`
        SELECT t.*, td.id AS del_id, td.shared_at, td.delegation_method, td.delegated_by,
               td.delegated_to_email, td.has_timeline
        FROM task_delegations td
        JOIN tasks t ON td.task_id = t.id
        WHERE td.acknowledged = 0
          AND t.status NOT IN ('completed','cancelled')
        ORDER BY td.shared_at ASC
      `)
      .all() as Record<string, unknown>[]

    return rows.map((row) => {
      const sharedAt = new Date(row.shared_at as string)
      const daysPending = Math.floor((Date.now() - sharedAt.getTime()) / (1000 * 60 * 60 * 24))
      return {
        task: this.rowToTask(row),
        delegation: this.rowToDelegation({ ...row, id: row.del_id }),
        daysPending
      }
    })
  }
}
