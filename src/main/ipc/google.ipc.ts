// Google Workspace IPC handlers — Phase 26
import { ipcMain, shell } from 'electron'
import Database from 'better-sqlite3'
import { GoogleAuthService } from '../services/google/google-auth.service'
import { GoogleCalendarService } from '../services/google/calendar.service'
import { GoogleGmailService } from '../services/google/gmail.service'
import { GoogleTasksService } from '../services/google/tasks.service'

export function initGoogleIPC(db: Database.Database): void {
  const authService = new GoogleAuthService(db)

  // ── Open external URL (for setup guide links) ─────────────────────────────

  ipcMain.handle('google:open-external', (_e, url: string) => {
    void shell.openExternal(url)
    return { success: true }
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  ipcMain.handle('google:get-status', () => {
    const user = authService.getSignedInUser()
    return {
      isConfigured: authService.isConfigured(),
      isSignedIn: !!user,
      user: user ? { email: user.email, name: user.name } : null,
      storedClientId: authService.getStoredClientId(),
    }
  })

  ipcMain.handle('google:save-credentials', (_e, clientId: string, clientSecret: string) => {
    try {
      authService.saveCredentials(clientId, clientSecret)
      return { success: true }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('google:sign-in', async () => {
    if (!authService.isConfigured()) {
      return {
        success: false,
        error: 'Google OAuth credentials are not set up yet. Use the setup guide below to add your credentials, then try again.',
      }
    }
    try {
      const tokens = await authService.signIn()
      return { success: true, user: { email: tokens.email, name: tokens.name } }
    } catch (e) {
      const msg = String(e)
      // Provide actionable error messages
      if (msg.includes('redirect_uri_mismatch') || msg.includes('redirect URI')) {
        return {
          success: false,
          error: 'Redirect URI mismatch. In Google Cloud Console, add this exact redirect URI to your OAuth client: http://localhost:42813/oauth/callback',
        }
      }
      if (msg.includes('invalid_client') || msg.includes('unauthorized_client')) {
        return {
          success: false,
          error: 'Invalid OAuth credentials. Double-check your Client ID and Client Secret in the setup guide below.',
        }
      }
      if (msg.includes('access_denied')) {
        return { success: false, error: 'Sign-in was cancelled or denied. Please try again.' }
      }
      if (msg.includes('timeout')) {
        return { success: false, error: 'Sign-in timed out. Please try again and complete Google sign-in within 5 minutes.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('google:sign-out', () => {
    authService.signOut()
    return { success: true }
  })

  // ── Calendar ──────────────────────────────────────────────────────────────

  ipcMain.handle('google:calendar:create-meeting', async (_e, opts: {
    title: string; startISO: string; endISO: string
    location?: string; description?: string
    attendeeEmails?: string[]; meetingCode?: string
  }) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()
    try {
      const svc = new GoogleCalendarService(auth)
      const result = await svc.createMeetingEvent(opts)
      return { success: true, ...result }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('google:calendar:create-task-reminder', async (_e, opts: {
    taskTitle: string; assignedTo: string; deadlineISO: string; meetingCode: string; itemCode?: string
  }) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()
    try {
      const svc = new GoogleCalendarService(auth)
      const result = await svc.createTaskReminder(opts)
      return { success: true, ...result }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('google:calendar:create-milestone', async (_e, opts: {
    milestone: string; dueDateISO: string; owner: string; meetingCode: string
  }) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()
    try {
      const svc = new GoogleCalendarService(auth)
      const result = await svc.createMilestoneEvent(opts)
      return { success: true, ...result }
    } catch (e) { return { success: false, error: String(e) } }
  })

  // ── Gmail ─────────────────────────────────────────────────────────────────

  ipcMain.handle('google:gmail:send-mom', async (_e, opts: {
    toEmails: string[]; senderName: string; meetingTitle: string
    meetingCode: string; meetingDate: string; momMarkdown: string
  }) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()
    try {
      const svc = new GoogleGmailService(auth)
      const result = await svc.sendMOM(opts)
      return { success: true, ...result }
    } catch (e) { return { success: false, error: String(e) } }
  })

  ipcMain.handle('google:gmail:send-task-reminder', async (_e, opts: {
    toEmail: string; taskTitle: string; assignedBy: string
    deadline: string; meetingCode: string; itemCode?: string
  }) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()
    try {
      const svc = new GoogleGmailService(auth)
      const result = await svc.sendTaskReminder(opts)
      return { success: true, ...result }
    } catch (e) { return { success: false, error: String(e) } }
  })

  // ── Google Tasks ──────────────────────────────────────────────────────────

  ipcMain.handle('google:tasks:sync-meeting', async (_e, meetingCode: string, meetingId: string) => {
    const auth = authService.getAuthClient()
    if (!auth) return { success: false, error: 'Not signed in to Google' }
    await authService.refreshIfNeeded()

    try {
      const tasks = db.prepare(
        "SELECT * FROM tasks WHERE meeting_id = ? AND status != 'completed' ORDER BY deadline ASC"
      ).all(meetingId) as Record<string, unknown>[]

      const svc = new GoogleTasksService(auth)
      const results = await svc.syncMeetingTasks(tasks.map((t) => ({
        title: t.title as string,
        assignedTo: t.assigned_to as string,
        deadline: t.deadline as string | undefined,
        description: t.description as string | undefined,
        meetingCode,
        itemCode: t.item_code as string | undefined,
      })))

      return { success: true, synced: results.length }
    } catch (e) { return { success: false, error: String(e) } }
  })
}
