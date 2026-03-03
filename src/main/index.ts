import { app, shell, BrowserWindow, ipcMain, session, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDB, closeDB } from './db/database'
import { AlertSchedulerService } from './services/alert-scheduler.service'
import { AlertPreferences } from '../shared/types/alert.types'
import { initAlertIPC } from './ipc/alert.ipc'
import { initMeetingIPC } from './ipc/meeting.ipc'
import { initARIAIPC } from './ipc/aria.ipc'
import { initGoogleIPC } from './ipc/google.ipc'
import { initSyncIPC, runBackgroundSync } from './ipc/sync.ipc'

let schedulerService: AlertSchedulerService | null = null

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mom-pro')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Microphone permission — required for Web Speech API (voice recording) ──
  // Grant microphone access to the renderer (webkitSpeechRecognition needs it)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'microphone']
    callback(allowed.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'audioCapture', 'microphone'].includes(permission)
  })

  // On macOS, request system-level microphone access
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  }

  // Initialize SQLite DB with migrations
  const db = initDB()
  console.log('[Main] Database initialized')

  // Load alert preferences from DB
  let prefs: AlertPreferences | undefined
  try {
    const row = db.prepare('SELECT preferences_json FROM alert_preferences WHERE id = ?').get('default') as
      { preferences_json: string } | undefined
    if (row) prefs = JSON.parse(row.preferences_json)
  } catch {}

  // Initialize Alert Scheduler
  schedulerService = new AlertSchedulerService(db, prefs)

  // Wire IPC handlers
  initAlertIPC(schedulerService)
  initMeetingIPC(db, schedulerService)
  initARIAIPC(db)
  initGoogleIPC(db)
  initSyncIPC(db)
  ipcMain.on('ping', () => console.log('pong'))

  // Ollama model health check IPC
  ipcMain.handle('ollama:health-check', async () => {
    const { MOMGeneratorService } = await import('./services/mom-generator.service')
    return MOMGeneratorService.checkOllamaAvailable()
  })

  // On-demand microphone permission request — renderer calls this when getUserMedia
  // fails or when macOS permission is denied. Opens System Preferences automatically.
  ipcMain.handle('mic:request-permission', async () => {
    if (process.platform !== 'darwin') return { granted: true }
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status === 'granted') return { granted: true }
      if (status === 'denied' || status === 'restricted') {
        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
        return { granted: false, openedPrefs: true }
      }
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (granted === true) return { granted: true }
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
      return { granted: false, openedPrefs: true }
    } catch (e) {
      return { granted: false, error: String(e) }
    }
  })

  // Create window
  const mainWindow = createWindow()
  schedulerService.setWindow(mainWindow)

  // Start scheduler (loads & schedules all saved alerts)
  await schedulerService.initialize()
  console.log('[Main] Alert Scheduler running')

  // Background Google Workspace sync (runs only if signed in, non-blocking)
  void runBackgroundSync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  schedulerService?.shutdown()
  closeDB()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
