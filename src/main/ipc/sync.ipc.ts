// Google Workspace Sync IPC handlers — Phase 27
import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { GoogleSyncService } from '../services/google/sync.service'
import { GoogleAuthService } from '../services/google/google-auth.service'

let syncService: GoogleSyncService | null = null

export function initSyncIPC(db: Database.Database): void {
  const authService = new GoogleAuthService(db)
  syncService = new GoogleSyncService(db, authService)

  // Manual trigger — sync a specific meeting now
  ipcMain.handle('sync:meeting', async (_e, meetingId: string) => {
    if (!syncService) return { error: 'Sync service not initialized' }
    return syncService.syncMeeting(meetingId)
  })

  // Manual trigger — sync a specific task now
  ipcMain.handle('sync:task', async (_e, taskId: string) => {
    if (!syncService) return { error: 'Sync service not initialized' }
    return syncService.syncTask(taskId)
  })

  // Get sync status for a meeting
  ipcMain.handle('sync:status', (_e, meetingId: string) => {
    if (!syncService) return { calendarSynced: false, emailSent: false, tasksSynced: 0 }
    return syncService.getSyncStatus(meetingId)
  })

  // Trigger full initial sync (renderer can call this manually)
  ipcMain.handle('sync:run-initial', async () => {
    if (!syncService) return { error: 'Sync service not initialized' }
    return syncService.runInitialSync()
  })
}

// Exported for use in meeting.ipc.ts hooks — fires sync after finalize
export async function triggerMeetingSync(meetingId: string): Promise<void> {
  if (!syncService) return
  try {
    const result = await syncService.syncMeeting(meetingId)
    console.log(`[SyncIPC] Meeting ${meetingId} synced — calendar: ${!!result.calendarEventId}, email: ${result.emailSent}, tasks: ${result.tasksSynced}`)
    if (result.errors.length) console.warn('[SyncIPC] Sync errors:', result.errors)
  } catch (e) {
    console.error('[SyncIPC] triggerMeetingSync error:', e)
  }
}

// Exported for use in meeting.ipc.ts hooks — fires sync after task add
export async function triggerTaskSync(taskId: string): Promise<void> {
  if (!syncService) return
  try {
    await syncService.syncTask(taskId)
  } catch (e) {
    console.error('[SyncIPC] triggerTaskSync error:', e)
  }
}

// Called from main/index.ts on app ready — runs background initial sync
export async function runBackgroundSync(): Promise<void> {
  if (!syncService) return
  try {
    const result = await syncService.runInitialSync()
    console.log(`[SyncIPC] Background initial sync done — meetings: ${result.meetingsSynced}, tasks: ${result.tasksSynced}`)
  } catch (e) {
    console.error('[SyncIPC] Background initial sync error:', e)
  }
}
