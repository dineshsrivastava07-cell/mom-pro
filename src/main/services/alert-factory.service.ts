// Phase 17 Part B — Alert Factory Service
// Generates all alert records for a task based on deadline, delegation state, etc.

import { v4 as uuidv4 } from 'uuid'
import {
  Alert,
  AlertTriggerType,
  AlertSeverity,
  TaskDelegation,
  AlertPreferences,
  DEFAULT_ALERT_PREFERENCES
} from '../../shared/types/alert.types'
import { Task, Meeting } from '../../shared/types/meeting.types'

interface AlertBuildParams {
  task: Task
  meeting: Meeting
  triggerType: AlertTriggerType
  severity: AlertSeverity
  scheduledAt: Date
  title: string
  message: string
  detailMessage: string
  requiresFollowUpRemark?: boolean
  isFollowUpAlert?: boolean
  parentAlertId?: string
}

export class AlertFactoryService {
  private prefs: AlertPreferences

  constructor(prefs?: AlertPreferences) {
    this.prefs = prefs ?? DEFAULT_ALERT_PREFERENCES
  }

  updatePreferences(prefs: AlertPreferences): void {
    this.prefs = prefs
  }

  // ─── MAIN ENTRY POINT ──────────────────────────────────────────────────────
  // Called after MOM finalization for every task
  generateAlertsForTask(task: Task, meeting: Meeting): Alert[] {
    if (!this.prefs.enabled) return []

    const alerts: Alert[] = []

    if (task.deadline) {
      alerts.push(...this.buildDeadlineAlertChain(task, meeting))
    } else if (this.prefs.taskAlerts.noTimelineAlert) {
      alerts.push(this.buildNoTimelineAlert(task, meeting))
    }

    if (!task.wasShared && !task.wasDelegated && this.prefs.taskAlerts.unsharedTaskAlert) {
      alerts.push(this.buildUnsharedTaskAlert(task, meeting))
    }

    return alerts
  }

  // ─── DEADLINE ALERT CHAIN (4 linked alerts) ────────────────────────────────
  buildDeadlineAlertChain(task: Task, meeting: Meeting): Alert[] {
    const deadline = new Date(task.deadline!)
    const now = new Date()
    const chain: Alert[] = []

    const [dh, dm] = this.prefs.deadlineAlerts.oneWeekTime.split(':').map(Number)
    const [dh2, dm2] = this.prefs.deadlineAlerts.twoDaysTime.split(':').map(Number)
    const [dh1, dm1] = this.prefs.deadlineAlerts.oneDayTime.split(':').map(Number)
    const [dhO, dmO] = this.prefs.deadlineAlerts.onDayOfTime.split(':').map(Number)

    // 1-WEEK ALERT
    if (this.prefs.deadlineAlerts.oneWeekBefore) {
      const oneWeek = new Date(deadline)
      oneWeek.setDate(oneWeek.getDate() - 7)
      oneWeek.setHours(dh, dm, 0, 0)
      if (oneWeek > now) {
        chain.push(this.buildAlert({
          task, meeting,
          triggerType: 'deadline_1week',
          severity: 'info',
          scheduledAt: oneWeek,
          title: `⏰ 1 Week: ${task.title.slice(0, 50)}`,
          message: `Deadline in 7 days | ${task.assignedTo} | ${meeting.meetingCode}`,
          detailMessage: this.buildDetailMessage(task, meeting, '7 days')
        }))
      }
    }

    // 2-DAY ALERT
    if (this.prefs.deadlineAlerts.twoDaysBefore) {
      const twoDays = new Date(deadline)
      twoDays.setDate(twoDays.getDate() - 2)
      twoDays.setHours(dh2, dm2, 0, 0)
      if (twoDays > now) {
        const prev = chain[chain.length - 1]
        chain.push(this.buildAlert({
          task, meeting,
          triggerType: 'deadline_2days',
          severity: 'warning',
          scheduledAt: twoDays,
          title: `⚠️ 2 Days Left: ${task.title.slice(0, 50)}`,
          message: `Deadline in 2 days | ${task.assignedTo} | ${meeting.meetingCode}`,
          detailMessage: this.buildDetailMessage(task, meeting, '2 days'),
          parentAlertId: prev?.id
        }))
      }
    }

    // 1-DAY ALERT
    if (this.prefs.deadlineAlerts.oneDayBefore) {
      const oneDay = new Date(deadline)
      oneDay.setDate(oneDay.getDate() - 1)
      oneDay.setHours(dh1, dm1, 0, 0)
      if (oneDay > now) {
        const prev = chain[chain.length - 1]
        chain.push(this.buildAlert({
          task, meeting,
          triggerType: 'deadline_1day',
          severity: 'urgent',
          scheduledAt: oneDay,
          title: `🔴 Tomorrow Deadline: ${task.title.slice(0, 45)}`,
          message: `Deadline TOMORROW | ${task.assignedTo} | ${meeting.meetingCode}`,
          detailMessage: this.buildDetailMessage(task, meeting, 'tomorrow'),
          parentAlertId: prev?.id
        }))
      }
    }

    // OVERDUE ALERT (fires at deadline time, then re-escalates every 2 days)
    if (this.prefs.deadlineAlerts.onDayOf) {
      const overdue = new Date(deadline)
      overdue.setHours(dhO, dmO, 0, 0)
      const prev = chain[chain.length - 1]
      chain.push(this.buildAlert({
        task, meeting,
        triggerType: 'deadline_overdue',
        severity: 'critical',
        scheduledAt: overdue,
        title: `🚨 OVERDUE: ${task.title.slice(0, 50)}`,
        message: `OVERDUE! Mark done or add follow-up | ${task.assignedTo} | ${meeting.meetingCode}`,
        detailMessage: this.buildDetailMessage(task, meeting, 'OVERDUE'),
        requiresFollowUpRemark: true,
        isFollowUpAlert: true,
        parentAlertId: prev?.id
      }))
    }

    return chain
  }

  // ─── NO TIMELINE ALERT ─────────────────────────────────────────────────────
  buildNoTimelineAlert(task: Task, meeting: Meeting): Alert {
    const hours = this.prefs.taskAlerts.noTimelineAfterHours
    const fireAt = new Date()
    fireAt.setHours(fireAt.getHours() + hours)
    return this.buildAlert({
      task, meeting,
      triggerType: 'no_timeline_set',
      severity: 'warning',
      scheduledAt: fireAt,
      title: `📅 No Deadline: ${task.title.slice(0, 50)}`,
      message: `Action item has no deadline. Set one now | ${meeting.meetingCode}`,
      detailMessage: `
[${task.itemCode?.full ?? 'ACT-?'}] "${task.title}"
Assigned to: ${task.assignedTo}
Discussed in: ${meeting.title} (${meeting.meetingCode})
Meeting Date: ${new Date(meeting.scheduledStart).toLocaleDateString('en-IN')}

⚠️ This action item was finalized without a deadline.
Please set a deadline to enable automatic follow-up alerts.

Action: Open task → Set Deadline → Save
      `.trim()
    })
  }

  // ─── UNSHARED TASK ALERT ───────────────────────────────────────────────────
  buildUnsharedTaskAlert(task: Task, meeting: Meeting): Alert {
    const hours = this.prefs.taskAlerts.unsharedAfterHours
    const fireAt = new Date()
    fireAt.setHours(fireAt.getHours() + hours)
    return this.buildAlert({
      task, meeting,
      triggerType: 'task_unshared',
      severity: 'warning',
      scheduledAt: fireAt,
      title: `📤 Not Shared: ${task.title.slice(0, 50)}`,
      message: `Task not yet shared or delegated | ${meeting.meetingCode}`,
      detailMessage: `
[${task.itemCode?.full ?? 'ACT-?'}] "${task.title}"
Assigned to: ${task.assignedTo}
Status: NOT SHARED / NOT DELEGATED

⚠️ This task was not shared with ${task.assignedTo} and was not
formally delegated. ${task.assignedTo} may not know about this commitment.

Recommended Actions:
1. Send task via Email to ${task.assignedTo}
2. Or formally delegate from Task Board
3. Or mark as "Verbally Communicated" to stop this alert
      `.trim()
    })
  }

  // ─── UNDELEGATED TASK ALERT ────────────────────────────────────────────────
  buildUndelegatedAlert(task: Task, delegation: TaskDelegation, meeting: Meeting): Alert {
    const hours = this.prefs.taskAlerts.undelegatedAfterHours
    const fireAt = new Date(delegation.sharedAt)
    fireAt.setHours(fireAt.getHours() + hours)
    return this.buildAlert({
      task, meeting,
      triggerType: 'task_undelegated',
      severity: 'warning',
      scheduledAt: fireAt,
      title: `❓ Awaiting Ack: ${task.title.slice(0, 50)}`,
      message: `${task.assignedTo} has not acknowledged this task | ${meeting.meetingCode}`,
      detailMessage: `
[${task.itemCode?.full ?? 'ACT-?'}] "${task.title}"
Delegated to: ${task.assignedTo} (${task.assignedToEmail ?? 'no email'})
Delegated via: ${delegation.delegationMethod}
Sent at: ${new Date(delegation.sharedAt).toLocaleString('en-IN')}
Acknowledged: NO

⚠️ ${hours} hours have passed and no acknowledgment received.

Recommended Actions:
1. Follow up with ${task.assignedTo} directly
2. Re-send task email with acknowledgment request
3. Mark as "Acknowledged Verbally" to resolve this alert
      `.trim()
    })
  }

  // ─── MANDATORY FOLLOW-UP ALERT ─────────────────────────────────────────────
  buildMandatoryFollowUpAlert(task: Task, meeting: Meeting, daysPastDue: number): Alert {
    return this.buildAlert({
      task, meeting,
      triggerType: 'followup_mandatory',
      severity: 'critical',
      scheduledAt: new Date(),   // Fire immediately
      title: `🚨 MANDATORY FOLLOW-UP: ${task.title.slice(0, 40)}`,
      message: `${daysPastDue} days overdue. Follow-up remark REQUIRED | ${meeting.meetingCode}`,
      detailMessage: `
[${task.itemCode?.full ?? 'ACT-?'}] "${task.title}"
Assigned to: ${task.assignedTo}
Original Deadline: ${task.deadline ? new Date(task.deadline).toLocaleDateString('en-IN') : 'Not set'}
Days Past Due: ${daysPastDue} days

🚨 CRITICAL: This task is ${daysPastDue} days overdue with no status update.

A follow-up remark is MANDATORY before this alert can be dismissed.
You MUST provide one of:
  • Current status update
  • Revised deadline with reason
  • Escalation note
  • Reason for closure/cancellation

You cannot dismiss this alert without adding a remark.

Referenced from: ${meeting.title} | ${meeting.meetingCode}
      `.trim(),
      requiresFollowUpRemark: true,
      isFollowUpAlert: true
    })
  }

  // ─── MANUAL TASK SHARED ALERT ──────────────────────────────────────────────
  buildManualSharedAlert(task: Task, meeting: Meeting, delegation: TaskDelegation): Alert {
    const fireAt = new Date(delegation.sharedAt)
    fireAt.setHours(fireAt.getHours() + 24)
    return this.buildAlert({
      task, meeting,
      triggerType: 'manual_task_shared',
      severity: 'info',
      scheduledAt: fireAt,
      title: `✅ Task Shared — Confirm Receipt: ${task.title.slice(0, 40)}`,
      message: `Did ${task.assignedTo} confirm receiving this task? | ${meeting.meetingCode}`,
      detailMessage: `
[${task.itemCode?.full ?? 'ACT-?'}] "${task.title}" — MANUALLY ADDED TASK

You shared this task with ${task.assignedTo} via ${delegation.delegationMethod}.
${delegation.hasTimeline && delegation.deadline
  ? `Deadline given: ${new Date(delegation.deadline).toLocaleDateString('en-IN')}`
  : '⚠️ No deadline was given when sharing this task.'}

Please confirm:
• Has ${task.assignedTo} acknowledged receiving this task?
• If no deadline was given, consider setting one for better tracking.

Action: Mark "Acknowledged" | Set Deadline | Re-send Reminder
      `.trim()
    })
  }

  // ─── CORE BUILDER ──────────────────────────────────────────────────────────
  private buildAlert(params: AlertBuildParams): Alert {
    const now = new Date()
    return {
      id: uuidv4(),
      meetingCode: params.meeting.meetingCode,
      itemCode: params.task.itemCode?.full ?? '',
      meetingTitle: params.meeting.title,
      meetingDate: new Date(params.meeting.scheduledStart).toISOString(),
      triggerType: params.triggerType,
      severity: params.severity,
      title: params.title.slice(0, 80),
      message: params.message.slice(0, 160),
      detailMessage: params.detailMessage,
      taskId: params.task.id,
      taskTitle: params.task.title,
      assignedTo: params.task.assignedTo,
      assignedToEmail: params.task.assignedToEmail,
      deadline: params.task.deadline ? new Date(params.task.deadline) : undefined,
      scheduledFireAt: params.scheduledAt,
      status: 'scheduled',
      snoozeCount: 0,
      isFollowUpAlert: params.isFollowUpAlert ?? false,
      parentAlertId: params.parentAlertId,
      requiresFollowUpRemark: params.requiresFollowUpRemark ?? false,
      isManualTask: params.task.isManual ?? false,
      wasShared: params.task.wasShared ?? false,
      wasDelegated: params.task.wasDelegated ?? false,
      delegationAcknowledged: false,
      createdAt: now,
      updatedAt: now
    }
  }

  private buildDetailMessage(task: Task, meeting: Meeting, timeframe: string): string {
    return `
[${task.itemCode?.full ?? 'ACT-?'}] ${task.title}
Meeting: ${meeting.title}
Meeting Code: ${meeting.meetingCode}
Meeting Date: ${new Date(meeting.scheduledStart).toLocaleDateString('en-IN')}
Assigned to: ${task.assignedTo}
Deadline: ${task.deadline ? new Date(task.deadline).toLocaleDateString('en-IN') : 'Not set'}
Time Remaining: ${timeframe}
Priority: ${task.priority.toUpperCase()}
Current Status: ${task.status.replace('_', ' ').toUpperCase()}

Discussed at: ${task.discussedAt ?? 'See transcript'}
Assigned by: ${task.assignedBy ?? 'MOM AI'}
LLM Model: ${meeting.llmModel}
    `.trim()
  }

  // ─── SNOOZE CALCULATION ────────────────────────────────────────────────────
  static calculateSnoozeEnd(minutes: number): Date {
    const d = new Date()
    d.setMinutes(d.getMinutes() + minutes)
    return d
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
