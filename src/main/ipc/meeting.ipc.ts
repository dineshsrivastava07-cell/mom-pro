// Meeting IPC handlers — full CRUD for meetings, tasks, attendees, agenda, decisions, highlights, timelines
import { ipcMain } from 'electron'
import { MeetingRepository, DBMeeting, DBTask, DBAttendee, DBAgendaItem, DBKeyDecision, DBHighlight, DBTimeline } from '../services/repositories/meeting.repo'
import { AlertSchedulerService } from '../services/alert-scheduler.service'
import { AlertFactoryService } from '../services/alert-factory.service'
import { meetingCodeGenerator } from '../../shared/utils/meeting-code.utils'
import { getNextMeetingSequential } from '../db/database'
import { triggerMeetingSync, triggerTaskSync } from './sync.ipc'
import {
  Meeting, Task, AgendaItem, KeyDecision, Highlight, Timeline, Attendee,
  TaskPriority, TaskStatus, MeetingMode, MOMDocument
} from '../../shared/types/meeting.types'
import { ItemCode } from '../../shared/utils/meeting-code.utils'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'

// ── Type conversion helpers ────────────────────────────────────────────────────

function toAttendee(a: DBAttendee): Attendee {
  return {
    id: a.id,
    name: a.name,
    email: a.email ?? undefined,
    role: a.role ?? undefined,
    organization: a.organization ?? undefined,
    isExternal: Boolean(a.is_external),
    attended: Boolean(a.attended),
  }
}

function dbMeetingToTyped(m: DBMeeting, attendees: DBAttendee[], code: string): Meeting {
  return {
    id: m.id,
    title: m.title,
    meetingCode: code,
    scheduledStart: new Date(m.scheduled_start),
    scheduledEnd: m.scheduled_end ? new Date(m.scheduled_end) : undefined,
    mode: m.mode as MeetingMode,
    location: m.location ?? undefined,
    organizer: m.organizer ?? '',
    attendees: attendees.map(toAttendee),
    status: 'completed' as const,
    momGenerated: Boolean(m.mom_generated),
    llmModel: m.llm_model,
    tags: m.tags ? m.tags.split(',').map((t) => t.trim()) : undefined,
    notes: m.notes ?? undefined,
    createdAt: new Date(m.created_at),
    updatedAt: new Date(),
  }
}

function dbTaskToTyped(t: DBTask, ic: ItemCode): Task {
  return {
    id: t.id,
    meetingId: t.meeting_id,
    meetingCode: t.meeting_code,
    itemCode: ic,
    title: t.title,
    description: t.description ?? undefined,
    assignedTo: t.assigned_to,
    assignedToEmail: t.assigned_to_email ?? undefined,
    assignedBy: t.assigned_by ?? undefined,
    mtgCodeRef: t.mtg_code_ref ?? '',
    deadline: t.deadline ? new Date(t.deadline) : undefined,
    priority: t.priority as TaskPriority,
    status: t.status as TaskStatus,
    discussedAt: t.discussed_at ?? undefined,
    wasShared: Boolean(t.was_shared),
    wasDelegated: Boolean(t.was_delegated),
    isManual: Boolean(t.is_manual),
    createdAt: new Date(t.created_at),
    updatedAt: new Date(),
  }
}

function dbAgendaToTyped(a: DBAgendaItem, ic: ItemCode): AgendaItem {
  return {
    id: a.id,
    meetingId: a.meeting_id,
    itemCode: ic,
    title: a.title,
    discussedAt: a.discussed_at ?? undefined,
    timeAllocated: a.time_allocated ?? undefined,
    status: a.status as AgendaItem['status'],
    notes: a.notes ?? undefined,
    order: a.sort_order,
  }
}

function dbDecisionToTyped(d: DBKeyDecision, ic: ItemCode): KeyDecision {
  return {
    id: d.id,
    meetingId: d.meeting_id,
    itemCode: ic,
    decision: d.decision,
    decidedBy: d.decided_by ?? 'Team',
    decidedAt: d.decided_at ?? undefined,
    impact: d.impact ?? undefined,
    requiresFollowUp: Boolean(d.requires_follow_up),
  }
}

function dbHighlightToTyped(h: DBHighlight, ic: ItemCode): Highlight {
  return {
    id: h.id,
    meetingId: h.meeting_id,
    itemCode: ic,
    text: h.text,
    speaker: h.speaker ?? undefined,
    timestamp: h.timestamp ?? undefined,
    isKeyPoint: Boolean(h.is_key_point),
    type: h.type as Highlight['type'],
  }
}

function dbTimelineToTyped(tl: DBTimeline, ic: ItemCode): Timeline {
  return {
    id: tl.id,
    meetingId: tl.meeting_id,
    itemCode: ic,
    milestone: tl.milestone,
    dueDate: new Date(tl.due_date),
    owner: tl.owner,
    linkedTaskIds: JSON.parse(tl.linked_task_ids ?? '[]') as string[],
    status: tl.status as Timeline['status'],
  }
}

// ── IPC Registration ──────────────────────────────────────────────────────────

export function initMeetingIPC(db: Database.Database, scheduler: AlertSchedulerService): void {
  const repo = new MeetingRepository(db)
  const factory = new AlertFactoryService()

  // ── Meetings ──────────────────────────────────────────────────────────────

  ipcMain.handle('meetings:create', (_e, data: {
    title: string; scheduledStart: string; scheduledEnd?: string
    mode: string; location?: string; organizer?: string; tags?: string; notes?: string
    attendees?: { name: string; email?: string; role?: string; organization?: string; isExternal?: boolean }[]
  }) => {
    const meeting = repo.createMeeting({
      title: data.title,
      meeting_code: null,
      meeting_code_sequential: null,
      scheduled_start: data.scheduledStart,
      scheduled_end: data.scheduledEnd ?? null,
      actual_start: null,
      actual_end: null,
      duration: null,
      mode: data.mode ?? 'in-person',
      location: data.location ?? null,
      organizer: data.organizer ?? null,
      status: 'draft',
      transcript: null,
      transcript_source: null,
      mom_generated: 0,
      mom_generated_at: null,
      llm_model: 'qwen2.5:3b',
      tags: data.tags ?? null,
      notes: data.notes ?? null,
    })
    if (data.attendees?.length) {
      for (const a of data.attendees) {
        repo.addAttendee({
          meeting_id: meeting.id,
          name: a.name, email: a.email ?? null, role: a.role ?? null,
          organization: a.organization ?? null,
          is_external: a.isExternal ? 1 : 0, attended: 1,
        })
      }
    }
    return { meeting, attendees: repo.getAttendees(meeting.id) }
  })

  ipcMain.handle('meetings:get', (_e, id: string) => {
    const meeting = repo.getMeeting(id)
    if (!meeting) return null
    return {
      meeting,
      attendees: repo.getAttendees(id),
      tasks: repo.getTasksByMeeting(id),
      agendaItems: repo.getAgendaItems(id),
      keyDecisions: repo.getKeyDecisions(id),
      highlights: repo.getHighlights(id),
      timelines: repo.getTimelines(id),
      momDocument: repo.getMOMDocument(id),
    }
  })

  ipcMain.handle('meetings:list', (_e, opts?: { status?: string; search?: string; limit?: number; offset?: number }) => {
    return repo.getAllMeetings(opts)
  })

  ipcMain.handle('meetings:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateMeeting(id, data)
    return repo.getMeeting(id)
  })

  ipcMain.handle('meetings:delete', (_e, id: string) => {
    repo.deleteMeeting(id)
    return { success: true }
  })

  ipcMain.handle('meetings:save-transcript', (_e, id: string, transcript: string, source: string) => {
    repo.updateMeeting(id, { transcript, transcript_source: source })
    return { success: true }
  })

  // ── MOM: AI Generation from Transcript ────────────────────────────────────

  ipcMain.handle('mom:generate-from-transcript', async (_e, meetingId: string, transcript: string) => {
    const dbMeeting = repo.getMeeting(meetingId)
    if (!dbMeeting) throw new Error('Meeting not found')

    const typedMeeting = dbMeetingToTyped(dbMeeting, repo.getAttendees(meetingId), dbMeeting.meeting_code ?? '')
    const { MOMGeneratorService } = await import('../services/mom-generator.service')
    const svc = new MOMGeneratorService()
    const result = await svc.generateMOMFromTranscript(transcript, typedMeeting)

    // Persist the AI-generated content back to DB
    if (result.agenda?.length) {
      const existing = repo.getAgendaItems(meetingId)
      if (!existing.length) {
        for (const item of result.agenda) {
          repo.addAgendaItem({
            meeting_id: meetingId, item_code: null, title: item.title,
            discussed_at: item.discussedAt ?? null,
            time_allocated: item.timeAllocated ?? null,
            status: item.status ?? 'discussed', notes: item.notes ?? null,
            sort_order: item.order ?? 0,
          })
        }
      }
    }
    if (result.keyDecisions?.length) {
      const existing = repo.getKeyDecisions(meetingId)
      if (!existing.length) {
        for (const dec of result.keyDecisions) {
          repo.addKeyDecision({
            meeting_id: meetingId, item_code: null, decision: dec.decision,
            decided_by: dec.decidedBy ?? null, decided_at: dec.decidedAt ?? null,
            impact: dec.impact ?? null, requires_follow_up: dec.requiresFollowUp ? 1 : 0,
          })
        }
      }
    }
    if (result.tasks?.length) {
      const existing = repo.getTasksByMeeting(meetingId)
      if (!existing.length) {
        for (const task of result.tasks) {
          repo.addTask({
            meeting_id: meetingId,
            meeting_code: dbMeeting.meeting_code ?? '',
            item_code: null, mtg_code_ref: null,
            title: task.title, description: task.description ?? null,
            assigned_to: task.assignedTo,
            assigned_to_email: task.assignedToEmail ?? null,
            assigned_by: task.assignedBy ?? null,
            deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
            priority: task.priority ?? 'medium',
            status: 'pending',
            discussed_at: task.discussedAt ?? null,
            was_shared: 0, was_delegated: 0, is_manual: 0, edit_history: '[]',
          })
        }
      }
    }
    if (result.highlights?.length) {
      const existing = repo.getHighlights(meetingId)
      if (!existing.length) {
        for (const h of result.highlights) {
          repo.addHighlight({
            meeting_id: meetingId, item_code: null, text: h.text,
            speaker: h.speaker ?? null, timestamp: h.timestamp ?? null,
            is_key_point: h.isKeyPoint ? 1 : 0, type: h.type ?? 'general',
          })
        }
      }
    }
    if (result.timelines?.length) {
      const existing = repo.getTimelines(meetingId)
      if (!existing.length) {
        for (const tl of result.timelines) {
          repo.addTimeline({
            meeting_id: meetingId, item_code: null, milestone: tl.milestone,
            due_date: new Date(tl.dueDate).toISOString(),
            owner: tl.owner, linked_task_ids: '[]', status: 'on_track',
          })
        }
      }
    }

    repo.updateMeeting(meetingId, { mom_generated: 1, mom_generated_at: new Date().toISOString(), transcript })

    return {
      success: true,
      summary: result.summary,
      nextSteps: result.nextSteps,
      agendaCount: result.agenda?.length ?? 0,
      taskCount: result.tasks?.length ?? 0,
      decisionCount: result.keyDecisions?.length ?? 0,
    }
  })

  // ── Finalize: assign meeting code + sub-codes + activate alerts ───────────

  ipcMain.handle('meetings:finalize', (_e, meetingId: string, finalizedBy = 'User') => {
    const meeting = repo.getMeeting(meetingId)
    if (!meeting) throw new Error('Meeting not found')

    const meetingDate = new Date(meeting.scheduled_start)
    const yearMonth = `${String(meetingDate.getFullYear()).slice(-2)}${String(meetingDate.getMonth() + 1).padStart(2, '0')}`
    const seq = getNextMeetingSequential(db, yearMonth)
    const codeObj = meetingCodeGenerator.generate({ meetingDate, title: meeting.title, sequentialNumber: seq })

    // Assign MTG code to meeting
    repo.updateMeeting(meetingId, { meeting_code: codeObj.full, meeting_code_sequential: seq, status: 'published' })

    // Fetch all sub-items
    const tasks      = repo.getTasksByMeeting(meetingId)
    const agenda     = repo.getAgendaItems(meetingId)
    const decisions  = repo.getKeyDecisions(meetingId)
    const highlights = repo.getHighlights(meetingId)
    const timelines  = repo.getTimelines(meetingId)
    const dbAttendees = repo.getAttendees(meetingId)

    // Build typed meeting for alert generation and markdown
    const updatedMeeting = repo.getMeeting(meetingId)!
    const typedMeeting = dbMeetingToTyped(updatedMeeting, dbAttendees, codeObj.full)

    // Assign sub-codes to agenda
    const typedAgenda: AgendaItem[] = agenda.map((item, i) => {
      const ic = meetingCodeGenerator.generateItemCode(codeObj.full, 'AGN', i + 1)
      repo.updateAgendaItem(item.id, { item_code: ic.full })
      repo.registerItemCode(ic.full, codeObj.full, 'AGN', i + 1, 'agenda_items', item.id, `[AGN-${String(i+1).padStart(2,'0')}] ${item.title}`)
      return dbAgendaToTyped(item, ic)
    })

    // Assign sub-codes to decisions
    const typedDecisions: KeyDecision[] = decisions.map((item, i) => {
      const ic = meetingCodeGenerator.generateItemCode(codeObj.full, 'DEC', i + 1)
      repo.updateKeyDecision(item.id, { item_code: ic.full })
      repo.registerItemCode(ic.full, codeObj.full, 'DEC', i + 1, 'key_decisions', item.id, `[DEC-${String(i+1).padStart(2,'0')}] ${item.decision.slice(0,60)}`)
      return dbDecisionToTyped(item, ic)
    })

    // Assign sub-codes to highlights
    const typedHighlights: Highlight[] = highlights.map((item, i) => {
      const ic = meetingCodeGenerator.generateItemCode(codeObj.full, 'HLT', i + 1)
      repo.updateHighlight(item.id, { item_code: ic.full })
      repo.registerItemCode(ic.full, codeObj.full, 'HLT', i + 1, 'highlights', item.id, `[HLT-${String(i+1).padStart(2,'0')}] ${item.text.slice(0,60)}`)
      return dbHighlightToTyped(item, ic)
    })

    // Assign sub-codes to timelines
    const typedTimelines: Timeline[] = timelines.map((item, i) => {
      const ic = meetingCodeGenerator.generateItemCode(codeObj.full, 'TML', i + 1)
      repo.updateTimeline(item.id, { item_code: ic.full })
      repo.registerItemCode(ic.full, codeObj.full, 'TML', i + 1, 'timelines', item.id, `[TML-${String(i+1).padStart(2,'0')}] ${item.milestone.slice(0,60)}`)
      return dbTimelineToTyped(item, ic)
    })

    // Assign sub-codes to tasks + generate + schedule alerts
    const activatedAlertIds: string[] = []
    const typedTasks: Task[] = tasks.map((task, i) => {
      const ic = meetingCodeGenerator.generateItemCode(codeObj.full, 'ACT', i + 1)
      repo.updateTask(task.id, { item_code: ic.full, mtg_code_ref: codeObj.full, meeting_code: codeObj.full })
      repo.registerItemCode(ic.full, codeObj.full, 'ACT', i + 1, 'tasks', task.id, `[ACT-${String(i+1).padStart(2,'0')}] ${task.title.slice(0,60)}`)

      const updatedTask = repo.getTask(task.id)!
      const typedTask = dbTaskToTyped(updatedTask, ic)

      // Generate + persist + schedule alerts
      const alerts = factory.generateAlertsForTask(typedTask, typedMeeting)
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
        scheduler.scheduleAlert(alert)
      }
      activatedAlertIds.push(...alerts.map((a) => a.id))

      return typedTask
    })

    // Build and save MOM document
    const { MOMGeneratorService } = require('../services/mom-generator.service')
    const svc = new MOMGeneratorService()

    const momDoc: MOMDocument = {
      id: uuidv4(),
      meetingId,
      meetingCode: codeObj.full,
      version: 1,
      meeting: typedMeeting,
      agenda: typedAgenda,
      tasks: typedTasks,
      keyDecisions: typedDecisions,
      highlights: typedHighlights,
      timelines: typedTimelines,
      llmModel: 'qwen2.5:3b',
      alertsActivated: activatedAlertIds.length > 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const markdown = svc.formatMOMAsMarkdown(momDoc)

    repo.upsertMOMDocument({
      meeting_id: meetingId, meeting_code: codeObj.full, version: 1,
      summary: null, next_steps: null, next_meeting_date: null,
      generated_markdown: markdown, llm_model: 'qwen2.5:3b',
      finalized_at: new Date().toISOString(), finalized_by: finalizedBy,
      alerts_activated: activatedAlertIds.length,
    })

    // Trigger Google Workspace sync in background (non-blocking)
    void triggerMeetingSync(meetingId)

    return { meetingCode: codeObj.full, alertsActivated: activatedAlertIds.length, displayLabel: codeObj.displayLabel }
  })

  // ── Tasks ─────────────────────────────────────────────────────────────────

  ipcMain.handle('tasks:add', (_e, meetingId: string, data: {
    title: string; assignedTo: string; assignedToEmail?: string
    assignedBy?: string; deadline?: string; priority?: string; description?: string
  }) => {
    const meeting = repo.getMeeting(meetingId)
    if (!meeting) throw new Error('Meeting not found')
    const task = repo.addTask({
      meeting_id: meetingId,
      meeting_code: meeting.meeting_code ?? '',
      item_code: null, mtg_code_ref: null,
      title: data.title, description: data.description ?? null,
      assigned_to: data.assignedTo, assigned_to_email: data.assignedToEmail ?? null,
      assigned_by: data.assignedBy ?? null, deadline: data.deadline ?? null,
      priority: data.priority ?? 'medium', status: 'pending',
      discussed_at: null, was_shared: 0, was_delegated: 0, is_manual: 1,
      edit_history: '[]',
    })
    // Sync to Google Tasks if deadline is set
    if (data.deadline) void triggerTaskSync(task.id)
    return task
  })

  ipcMain.handle('tasks:update', (_e, taskId: string, data: Record<string, unknown>) => {
    repo.updateTask(taskId, data)
    return repo.getTask(taskId)
  })

  ipcMain.handle('tasks:delete', (_e, taskId: string) => {
    repo.deleteTask(taskId)
    return { success: true }
  })

  ipcMain.handle('tasks:list', (_e, opts?: { status?: string; search?: string }) => {
    return repo.getAllTasks(opts)
  })

  ipcMain.handle('tasks:stats', () => repo.getTaskStats())

  // ── Tasks: Create standalone (manual, no meeting required) ────────────────

  ipcMain.handle('tasks:create-manual', (_e, data: {
    title: string; assignedTo: string; assignedToEmail?: string
    assignedBy?: string; deadline?: string; priority?: string; description?: string
  }) => {
    // Find or create a persistent "Standalone Tasks" virtual meeting
    let manualMeeting = db.prepare("SELECT * FROM meetings WHERE id = 'manual-standalone'").get() as Record<string, unknown> | null
    if (!manualMeeting) {
      db.prepare(`
        INSERT INTO meetings (id, title, scheduled_start, mode, status, mom_generated, llm_model, created_at, updated_at)
        VALUES ('manual-standalone', 'Standalone Tasks', datetime('now'), 'manual', 'active', 0, 'manual', datetime('now'), datetime('now'))
      `).run()
      manualMeeting = db.prepare("SELECT * FROM meetings WHERE id = 'manual-standalone'").get() as Record<string, unknown>
    }
    return repo.addTask({
      meeting_id: 'manual-standalone',
      meeting_code: 'MANUAL',
      item_code: null, mtg_code_ref: null,
      title: data.title, description: data.description ?? null,
      assigned_to: data.assignedTo, assigned_to_email: data.assignedToEmail ?? null,
      assigned_by: data.assignedBy ?? null, deadline: data.deadline ?? null,
      priority: data.priority ?? 'medium', status: 'pending',
      discussed_at: null, was_shared: 0, was_delegated: 0, is_manual: 1,
      edit_history: '[]',
    })
  })

  // ── Attendees ─────────────────────────────────────────────────────────────

  ipcMain.handle('attendees:add', (_e, meetingId: string, data: {
    name: string; email?: string; role?: string; organization?: string; isExternal?: boolean
  }) => {
    return repo.addAttendee({
      meeting_id: meetingId, name: data.name, email: data.email ?? null,
      role: data.role ?? null, organization: data.organization ?? null,
      is_external: data.isExternal ? 1 : 0, attended: 1,
    })
  })

  ipcMain.handle('attendees:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateAttendee(id, data)
    return { success: true }
  })

  ipcMain.handle('attendees:delete', (_e, id: string) => {
    repo.deleteAttendee(id)
    return { success: true }
  })

  // ── Agenda Items ──────────────────────────────────────────────────────────

  ipcMain.handle('agenda:add', (_e, meetingId: string, title: string, timeAllocated?: number) => {
    const existing = repo.getAgendaItems(meetingId)
    return repo.addAgendaItem({
      meeting_id: meetingId, item_code: null, title,
      discussed_at: null, time_allocated: timeAllocated ?? null,
      status: 'pending', notes: null, sort_order: existing.length,
    })
  })

  ipcMain.handle('agenda:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateAgendaItem(id, data); return { success: true }
  })

  ipcMain.handle('agenda:delete', (_e, id: string) => {
    repo.deleteAgendaItem(id); return { success: true }
  })

  // ── Key Decisions ─────────────────────────────────────────────────────────

  ipcMain.handle('decisions:add', (_e, meetingId: string, data: {
    decision: string; decidedBy?: string; impact?: string; requiresFollowUp?: boolean
  }) => {
    return repo.addKeyDecision({
      meeting_id: meetingId, item_code: null, decision: data.decision,
      decided_by: data.decidedBy ?? null, decided_at: new Date().toISOString(),
      impact: data.impact ?? null, requires_follow_up: data.requiresFollowUp ? 1 : 0,
    })
  })

  ipcMain.handle('decisions:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateKeyDecision(id, data); return { success: true }
  })

  ipcMain.handle('decisions:delete', (_e, id: string) => {
    repo.deleteKeyDecision(id); return { success: true }
  })

  // ── Highlights ────────────────────────────────────────────────────────────

  ipcMain.handle('highlights:add', (_e, meetingId: string, data: {
    text: string; speaker?: string; isKeyPoint?: boolean; type?: string
  }) => {
    return repo.addHighlight({
      meeting_id: meetingId, item_code: null, text: data.text,
      speaker: data.speaker ?? null, timestamp: null,
      is_key_point: data.isKeyPoint ? 1 : 0, type: data.type ?? 'general',
    })
  })

  ipcMain.handle('highlights:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateHighlight(id, data); return { success: true }
  })

  ipcMain.handle('highlights:delete', (_e, id: string) => {
    repo.deleteHighlight(id); return { success: true }
  })

  // ── Timelines ─────────────────────────────────────────────────────────────

  ipcMain.handle('timelines:add', (_e, meetingId: string, data: {
    milestone: string; dueDate: string; owner: string
  }) => {
    return repo.addTimeline({
      meeting_id: meetingId, item_code: null, milestone: data.milestone,
      due_date: data.dueDate, owner: data.owner, linked_task_ids: '[]', status: 'on_track',
    })
  })

  ipcMain.handle('timelines:update', (_e, id: string, data: Record<string, unknown>) => {
    repo.updateTimeline(id, data); return { success: true }
  })

  ipcMain.handle('timelines:delete', (_e, id: string) => {
    repo.deleteTimeline(id); return { success: true }
  })

  // ── Dashboard stats ───────────────────────────────────────────────────────

  ipcMain.handle('dashboard:stats', () => {
    const taskStats = repo.getTaskStats()
    return {
      totalMeetings: repo.getMeetingCount(),
      openTasks: taskStats.open,
      overdueTasks: taskStats.overdue,
      uniqueAttendees: repo.getUniqueAttendeeCount(),
      recentMeetings: repo.getRecentMeetings(5),
      upcomingDeadlines: repo.getUpcomingDeadlines(5),
    }
  })

  // ── MOM: Update markdown (manual edit) ───────────────────────────────────

  ipcMain.handle('mom:update-markdown', (_e, meetingId: string, markdown: string) => {
    const existing = repo.getMOMDocument(meetingId)
    if (existing) {
      db.prepare(`UPDATE mom_documents SET generated_markdown = ?, updated_at = datetime('now') WHERE meeting_id = ?`)
        .run(markdown, meetingId)
    } else {
      repo.upsertMOMDocument({
        meeting_id: meetingId, meeting_code: null, version: 1,
        summary: null, next_steps: null, next_meeting_date: null,
        generated_markdown: markdown, llm_model: 'manual',
        finalized_at: null, finalized_by: null, alerts_activated: 0,
      })
    }
    return { success: true }
  })

  // ── MOM: Save transcript from live recording ──────────────────────────────

  ipcMain.handle('mom:save-recording-transcript', (_e, meetingId: string, transcript: string) => {
    repo.updateMeeting(meetingId, { transcript, transcript_source: 'live-recording' })
    return { success: true }
  })

  // ── Search ────────────────────────────────────────────────────────────────

  ipcMain.handle('search:global', (_e, query: string) => {
    if (!query || query.length < 2) return { meetings: [], tasks: [], codes: [] }
    const meetings = repo.getAllMeetings({ search: query, limit: 10 })
    const tasks = repo.getAllTasks({ search: query })
    const codes = repo.searchItemCodes(query)
    return { meetings, tasks: tasks.slice(0, 20), codes: codes.slice(0, 20) }
  })
}
