// Phase 17 — Smart Alert Engine Types

export type AlertTriggerType =
  | 'deadline_1week'        // 7 days before deadline
  | 'deadline_2days'        // 2 days before deadline
  | 'deadline_1day'         // 1 day before deadline
  | 'deadline_overdue'      // Day of + every 2 days after (escalating)
  | 'task_unshared'         // Task created but never shared/delegated
  | 'task_undelegated'      // Task has assignee but never confirmed
  | 'followup_required'     // Task past due, not marked done
  | 'followup_mandatory'    // Critical/high task overdue > 3 days
  | 'meeting_reminder'      // 30-min before scheduled meeting
  | 'no_timeline_set'       // Action item created with no deadline
  | 'manual_task_shared'    // User manually shared — confirm receipt
  | 'manual_task_delegated' // User delegated — track acknowledgment

export type AlertStatus =
  | 'scheduled'  // Created, not yet fired
  | 'fired'      // Notification sent
  | 'snoozed'    // User snoozed (re-fires after snooze period)
  | 'dismissed'  // User explicitly dismissed
  | 'resolved'   // Associated task marked done — auto-resolved

export type AlertSeverity = 'info' | 'warning' | 'urgent' | 'critical'

export interface Alert {
  id: string

  // Identity & Reference
  meetingCode: string       // "MTG-2504-001-PLN"
  itemCode: string          // "MTG-2504-001-PLN/ACT-03"
  meetingTitle: string
  meetingDate: string

  // Alert Content
  triggerType: AlertTriggerType
  severity: AlertSeverity
  title: string             // Max 80 chars
  message: string           // Max 160 chars
  detailMessage: string     // Full context (no limit)

  // Target
  taskId?: string
  taskTitle?: string
  assignedTo: string
  assignedToEmail?: string
  deadline?: Date

  // Scheduling
  scheduledFireAt: Date
  status: AlertStatus
  firedAt?: Date
  snoozeUntil?: Date
  snoozeCount: number

  // Follow-up tracking
  isFollowUpAlert: boolean
  parentAlertId?: string
  followUpRemark?: string
  requiresFollowUpRemark: boolean

  // Manual task tracking
  isManualTask: boolean
  wasShared: boolean
  wasDelegated: boolean
  delegationAcknowledged: boolean

  createdAt: Date
  updatedAt: Date
}

export interface AlertChain {
  taskId: string
  itemCode: string
  alerts: Alert[]
  isFullyResolved: boolean
  resolvedAt?: Date
  resolvedBy?: string
}

export interface FollowUpRemark {
  id: string
  alertId: string
  taskId: string
  itemCode: string
  remark: string
  remarkBy: string
  newStatus: 'in_progress' | 'blocked' | 'deferred' | 'completed' | 'cancelled'
  newDeadline?: Date
  impactNote?: string
  addedAt: Date
}

export interface AlertPreferences {
  enabled: boolean
  deadlineAlerts: {
    oneWeekBefore: boolean
    oneWeekTime: string      // "09:00"
    twoDaysBefore: boolean
    twoDaysTime: string
    oneDayBefore: boolean
    oneDayTime: string
    onDayOf: boolean
    onDayOfTime: string
    overdueEscalation: boolean
    overdueEscalationIntervalDays: number  // Default: 2
  }
  taskAlerts: {
    unsharedTaskAlert: boolean
    unsharedAfterHours: number           // Default: 24
    undelegatedAlert: boolean
    undelegatedAfterHours: number        // Default: 48
    noTimelineAlert: boolean
    noTimelineAfterHours: number         // Default: 12
  }
  followUpSettings: {
    requireRemarkOnOverdue: boolean
    mandatoryRemarkAfterDays: number     // Default: 3
    remarkReminderIntervalHours: number  // Default: 12
  }
  quietHours: {
    enabled: boolean
    startHour: number  // 22 (10 PM)
    endHour: number    // 8 (8 AM)
    allowCriticalOverride: boolean
  }
  soundEnabled: boolean
  desktopBannerEnabled: boolean
  appBadgeEnabled: boolean
}

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  enabled: true,
  deadlineAlerts: {
    oneWeekBefore: true,
    oneWeekTime: '09:00',
    twoDaysBefore: true,
    twoDaysTime: '09:00',
    oneDayBefore: true,
    oneDayTime: '09:00',
    onDayOf: true,
    onDayOfTime: '09:00',
    overdueEscalation: true,
    overdueEscalationIntervalDays: 2
  },
  taskAlerts: {
    unsharedTaskAlert: true,
    unsharedAfterHours: 24,
    undelegatedAlert: true,
    undelegatedAfterHours: 48,
    noTimelineAlert: true,
    noTimelineAfterHours: 12
  },
  followUpSettings: {
    requireRemarkOnOverdue: true,
    mandatoryRemarkAfterDays: 3,
    remarkReminderIntervalHours: 12
  },
  quietHours: {
    enabled: true,
    startHour: 22,
    endHour: 8,
    allowCriticalOverride: true
  },
  soundEnabled: true,
  desktopBannerEnabled: true,
  appBadgeEnabled: true
}

// Task delegation record
export interface TaskDelegation {
  id: string
  taskId: string
  itemCode: string
  meetingCode: string
  delegatedTo: string
  delegatedToEmail?: string
  delegatedBy: string
  delegationMethod: 'email' | 'calendar' | 'manual' | 'whatsapp' | 'verbal' | 'phone' | 'in-person' | 'other'
  delegationNote?: string
  hasTimeline: boolean
  deadline?: Date
  acknowledged: boolean
  acknowledgedAt?: Date
  sharedAt: Date
}

// Alert summary for UI display
export interface AlertSummary {
  total: number
  critical: number
  urgent: number
  warning: number
  info: number
  requiresRemark: number
  unshared: number
  overdue: number
}
