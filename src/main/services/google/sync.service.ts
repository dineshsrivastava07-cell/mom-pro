// Google Workspace Sync Service — Phase 27
// Syncs meetings, tasks, and MOM documents to Google Calendar, Tasks, and Gmail
// Tracks sync state in google_sync_log to prevent duplicates

import Database from 'better-sqlite3'
import { Auth } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import { GoogleAuthService } from './google-auth.service'
import { GoogleCalendarService } from './calendar.service'
import { GoogleTasksService } from './tasks.service'
import { GoogleGmailService } from './gmail.service'

type OAuth2Client = Auth.OAuth2Client

export class GoogleSyncService {
  constructor(private db: Database.Database, private authService: GoogleAuthService) {}

  // ── Auth helper ────────────────────────────────────────────────────────────

  private async getAuthClient(): Promise<OAuth2Client | null> {
    if (!this.authService.isSignedIn()) return null
    const refreshed = await this.authService.refreshIfNeeded()
    if (!refreshed) return null
    return this.authService.getAuthClient()
  }

  // ── Sync log helpers ───────────────────────────────────────────────────────

  private isSynced(entityType: string, entityId: string, googleService: string): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM google_sync_log WHERE entity_type = ? AND entity_id = ? AND google_service = ? AND error IS NULL LIMIT 1`
    ).get(entityType, entityId, googleService)
    return !!row
  }

  private recordSync(entityType: string, entityId: string, googleService: string, googleId: string): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO google_sync_log (id, entity_type, entity_id, google_service, google_id, synced_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(uuidv4(), entityType, entityId, googleService, googleId)
  }

  private recordSyncError(entityType: string, entityId: string, googleService: string, error: string): void {
    this.db.prepare(
      `INSERT INTO google_sync_log (id, entity_type, entity_id, google_service, error, synced_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(uuidv4(), entityType, entityId, googleService, error)
  }

  // ── Sync a single finalized meeting ───────────────────────────────────────

  async syncMeeting(meetingId: string): Promise<{
    calendarEventId?: string; tasksSynced: number; emailSent: boolean; errors: string[]
  }> {
    const result = { calendarEventId: undefined as string | undefined, tasksSynced: 0, emailSent: false, errors: [] as string[] }

    const auth = await this.getAuthClient()
    if (!auth) { result.errors.push('Not authenticated with Google'); return result }

    const meeting = this.db.prepare(
      `SELECT * FROM meetings WHERE id = ? AND status = 'published' AND mom_generated = 1`
    ).get(meetingId) as Record<string, unknown> | null
    if (!meeting) { result.errors.push('Meeting not found or not finalized'); return result }

    // ── 1. Google Calendar event ──────────────────────────────────────────

    if (this.isSynced('meeting', meetingId, 'calendar')) {
      const existing = this.db.prepare(
        `SELECT google_id FROM google_sync_log WHERE entity_type='meeting' AND entity_id=? AND google_service='calendar'`
      ).get(meetingId) as Record<string, unknown> | null
      result.calendarEventId = existing?.google_id as string | undefined
    } else {
      try {
        const internalAttendees = this.db.prepare(
          `SELECT email FROM attendees WHERE meeting_id = ? AND email IS NOT NULL AND is_external = 0`
        ).all(meetingId) as Record<string, unknown>[]

        const calSvc = new GoogleCalendarService(auth)
        const startISO = meeting.scheduled_start as string
        // If no end time, default to 1 hour after start
        const endISO = (meeting.scheduled_end as string | null)
          ?? new Date(new Date(startISO).getTime() + 60 * 60000).toISOString()

        const eventResult = await calSvc.createMeetingEvent({
          title: meeting.title as string,
          startISO,
          endISO,
          location: meeting.location as string | undefined,
          description: `MOM Pro Meeting — ${meeting.meeting_code as string}`,
          attendeeEmails: internalAttendees.map((a) => a.email as string),
          meetingCode: meeting.meeting_code as string,
        })

        this.recordSync('meeting', meetingId, 'calendar', eventResult.eventId)
        result.calendarEventId = eventResult.eventId
        console.log(`[Sync] Calendar event created for meeting ${meetingId}: ${eventResult.htmlLink}`)
      } catch (e) {
        const msg = `Calendar event failed: ${String(e)}`
        result.errors.push(msg)
        this.recordSyncError('meeting', meetingId, 'calendar', msg)
        console.error(`[Sync] ${msg}`)
      }
    }

    // ── 2. Gmail — send MOM to internal attendees ─────────────────────────

    const momDoc = this.db.prepare(
      `SELECT generated_markdown FROM mom_documents WHERE meeting_id = ?`
    ).get(meetingId) as Record<string, unknown> | null

    if (momDoc?.generated_markdown && !this.isSynced('meeting', meetingId, 'gmail')) {
      try {
        const internalAttendees = this.db.prepare(
          `SELECT email FROM attendees WHERE meeting_id = ? AND email IS NOT NULL AND is_external = 0`
        ).all(meetingId) as Record<string, unknown>[]
        const toEmails = internalAttendees.map((a) => a.email as string).filter(Boolean)

        if (toEmails.length > 0) {
          const user = this.authService.getSignedInUser()
          const gmailSvc = new GoogleGmailService(auth)
          await gmailSvc.sendMOM({
            toEmails,
            senderName: user?.name ?? 'MOM Pro',
            meetingTitle: meeting.title as string,
            meetingCode: meeting.meeting_code as string,
            meetingDate: meeting.scheduled_start as string,
            momMarkdown: momDoc.generated_markdown as string,
          })
          this.recordSync('meeting', meetingId, 'gmail', 'sent')
          result.emailSent = true
          console.log(`[Sync] MOM email sent for meeting ${meetingId} to ${toEmails.length} attendees`)
        }
      } catch (e) {
        const msg = `Email send failed: ${String(e)}`
        result.errors.push(msg)
        this.recordSyncError('meeting', meetingId, 'gmail', msg)
        console.error(`[Sync] ${msg}`)
      }
    }

    // ── 3. Google Tasks + Calendar reminders for each task ────────────────

    const tasks = this.db.prepare(
      `SELECT * FROM tasks WHERE meeting_id = ? AND deadline IS NOT NULL`
    ).all(meetingId) as Record<string, unknown>[]

    for (const task of tasks) {
      const taskId = task.id as string
      if (this.isSynced('task', taskId, 'tasks')) { result.tasksSynced++; continue }

      try {
        const tasksSvc = new GoogleTasksService(auth)
        const taskResult = await tasksSvc.createTask({
          title: task.title as string,
          deadline: task.deadline as string,
          meetingCode: task.meeting_code as string,
          itemCode: task.item_code as string | undefined,
          assignedTo: task.assigned_to as string,
        })
        this.recordSync('task', taskId, 'tasks', taskResult.taskId)
        result.tasksSynced++
        console.log(`[Sync] Task ${taskId} synced to Google Tasks`)

        // Calendar deadline reminder
        try {
          const calSvc = new GoogleCalendarService(auth)
          const reminderResult = await calSvc.createTaskReminder({
            taskTitle: task.title as string,
            assignedTo: task.assigned_to as string,
            deadlineISO: task.deadline as string,
            meetingCode: task.meeting_code as string,
            itemCode: task.item_code as string | undefined,
          })
          this.recordSync('task', taskId, 'calendar', reminderResult.eventId)
          console.log(`[Sync] Calendar reminder created for task ${taskId}`)
        } catch (e) {
          this.recordSyncError('task', taskId, 'calendar', `Reminder failed: ${String(e)}`)
        }
      } catch (e) {
        const msg = `Task sync failed: ${String(e)}`
        result.errors.push(msg)
        this.recordSyncError('task', taskId, 'tasks', msg)
        console.error(`[Sync] ${msg}`)
      }
    }

    return result
  }

  // ── Sync a single task (called from tasks:add hook) ────────────────────

  async syncTask(taskId: string): Promise<{
    googleTaskId?: string; calendarReminderId?: string; synced: boolean
  }> {
    const result = { googleTaskId: undefined as string | undefined, calendarReminderId: undefined as string | undefined, synced: false }

    const auth = await this.getAuthClient()
    if (!auth) return result

    const task = this.db.prepare(
      `SELECT * FROM tasks WHERE id = ? AND deadline IS NOT NULL`
    ).get(taskId) as Record<string, unknown> | null
    if (!task) return result

    if (this.isSynced('task', taskId, 'tasks')) { result.synced = true; return result }

    try {
      const tasksSvc = new GoogleTasksService(auth)
      const taskResult = await tasksSvc.createTask({
        title: task.title as string,
        deadline: task.deadline as string,
        meetingCode: task.meeting_code as string,
        itemCode: task.item_code as string | undefined,
        assignedTo: task.assigned_to as string,
      })
      this.recordSync('task', taskId, 'tasks', taskResult.taskId)
      result.googleTaskId = taskResult.taskId
      result.synced = true
      console.log(`[Sync] Task ${taskId} synced to Google Tasks`)

      try {
        const calSvc = new GoogleCalendarService(auth)
        const reminderResult = await calSvc.createTaskReminder({
          taskTitle: task.title as string,
          assignedTo: task.assigned_to as string,
          deadlineISO: task.deadline as string,
          meetingCode: task.meeting_code as string,
          itemCode: task.item_code as string | undefined,
        })
        this.recordSync('task', taskId, 'calendar', reminderResult.eventId)
        result.calendarReminderId = reminderResult.eventId
      } catch (e) {
        this.recordSyncError('task', taskId, 'calendar', `Reminder failed: ${String(e)}`)
      }
    } catch (e) {
      this.recordSyncError('task', taskId, 'tasks', `Task sync failed: ${String(e)}`)
      console.error(`[Sync] Task ${taskId} sync error:`, e)
    }

    return result
  }

  // ── Background initial sync — run on app start ────────────────────────────

  async runInitialSync(): Promise<{ meetingsSynced: number; tasksSynced: number; errors: string[] }> {
    const result = { meetingsSynced: 0, tasksSynced: 0, errors: [] as string[] }

    if (!this.authService.isSignedIn()) {
      console.log('[Sync] Not signed in — skipping initial sync')
      return result
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoff = thirtyDaysAgo.toISOString()

    const meetings = this.db.prepare(
      `SELECT id FROM meetings WHERE scheduled_start >= ? AND status = 'published' AND mom_generated = 1`
    ).all(cutoff) as Record<string, unknown>[]

    console.log(`[Sync] Initial sync: found ${meetings.length} finalized meetings in last 30 days`)

    for (const m of meetings) {
      try {
        const syncResult = await this.syncMeeting(m.id as string)
        if (syncResult.calendarEventId || syncResult.emailSent) result.meetingsSynced++
        result.tasksSynced += syncResult.tasksSynced
        result.errors.push(...syncResult.errors)
      } catch (e) {
        result.errors.push(`Meeting ${m.id}: ${String(e)}`)
      }
    }

    console.log(`[Sync] Initial sync done — meetings: ${result.meetingsSynced}, tasks: ${result.tasksSynced}, errors: ${result.errors.length}`)
    return result
  }

  // ── Get sync status for a meeting ─────────────────────────────────────────

  getSyncStatus(meetingId: string): { calendarSynced: boolean; emailSent: boolean; tasksSynced: number } {
    const calendarSynced = this.isSynced('meeting', meetingId, 'calendar')
    const emailSent = this.isSynced('meeting', meetingId, 'gmail')

    const syncedTasksRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM google_sync_log
       WHERE entity_type = 'task' AND google_service = 'tasks' AND error IS NULL
         AND entity_id IN (SELECT id FROM tasks WHERE meeting_id = ?)`
    ).get(meetingId) as Record<string, unknown>

    return { calendarSynced, emailSent, tasksSynced: (syncedTasksRow?.count as number) ?? 0 }
  }
}
