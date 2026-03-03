import React, { useState, useEffect, useCallback } from 'react'
import {
  BellRing, Settings, LayoutDashboard, FileText, CheckSquare,
  ChevronRight, ChevronLeft, GripVertical, Search
} from 'lucide-react'
import AlertCenter from './pages/AlertCenter'
import { AlertDrawer } from './components/notifications/AlertDrawer'
import { AlertsTab } from './pages/Settings/AlertsTab'
import { GoogleTab } from './pages/Settings/GoogleTab'
import { DashboardPage } from './pages/Dashboard'
import { MeetingsPage } from './pages/Meetings'
import { TasksPage } from './pages/Tasks'
import { MeetingEditor } from './pages/MeetingEditor'
import { GlobalSearch } from './components/GlobalSearch'
import { ARIABubble } from './components/ARIA/ARIABubble'
import { useResizable } from './hooks/useResizable'

type Page = 'dashboard' | 'meetings' | 'tasks' | 'alerts' | 'settings'

interface AlertSummary {
  total: number
  critical: number
  requiresRemark: number
}

// ─── DRAG HANDLE ──────────────────────────────────────────────────────────────
function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }): React.JSX.Element {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 hover:w-[3px] transition-colors duration-150 flex items-center justify-center group relative z-10"
      title="Drag to resize"
    >
      <GripVertical className="w-3 h-3 text-gray-400 group-hover:text-indigo-600 absolute" />
    </div>
  )
}

function App(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)
  const [openMeetingInitialTab, setOpenMeetingInitialTab] = useState<string | undefined>(undefined)
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertSummary, setAlertSummary] = useState<AlertSummary>({ total: 0, critical: 0, requiresRemark: 0 })
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean; hasModel: boolean } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const sidebar = useResizable({ initial: 220, min: 52, max: 320 })

  useEffect(() => {
    loadAlertSummary()
    ;(async () => {
      const status = await window.electron.ipcRenderer.invoke('ollama:health-check') as { available: boolean; hasModel: boolean }
      setOllamaStatus(status)
    })()
    window.electron.ipcRenderer.on('alert:fired', loadAlertSummary)
    window.electron.ipcRenderer.on('alert:chain-resolved', loadAlertSummary)
    window.electron.ipcRenderer.on('alert:remark-added', loadAlertSummary)
    window.electron.ipcRenderer.on('alert:missed-bundle', () => { setCurrentPage('alerts'); loadAlertSummary() })
    return () => {
      window.electron.ipcRenderer.removeAllListeners('alert:fired')
      window.electron.ipcRenderer.removeAllListeners('alert:chain-resolved')
      window.electron.ipcRenderer.removeAllListeners('alert:remark-added')
      window.electron.ipcRenderer.removeAllListeners('alert:missed-bundle')
    }
  }, [])

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const loadAlertSummary = useCallback(async (): Promise<void> => {
    const summary = await window.electron.ipcRenderer.invoke('alerts:get-summary') as AlertSummary
    setAlertSummary(summary)
  }, [])

  const openMeeting = useCallback((id: string, tab?: string): void => {
    setOpenMeetingId(id)
    setOpenMeetingInitialTab(tab)
    setCurrentPage('meetings')
  }, [])

  const closeMeeting = useCallback((): void => {
    setOpenMeetingId(null)
    setOpenMeetingInitialTab(undefined)
  }, [])

  const effectiveSidebarWidth = sidebarCollapsed ? 52 : sidebar.size

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4 flex-shrink-0" /> },
    { id: 'meetings',  label: 'Meetings',  icon: <FileText      className="w-4 h-4 flex-shrink-0" /> },
    { id: 'tasks',     label: 'Tasks',     icon: <CheckSquare   className="w-4 h-4 flex-shrink-0" /> },
    { id: 'alerts',    label: 'Alerts',    icon: <BellRing      className="w-4 h-4 flex-shrink-0" /> },
    { id: 'settings',  label: 'Settings',  icon: <Settings      className="w-4 h-4 flex-shrink-0" /> },
  ]

  const showLabels = !sidebarCollapsed && sidebar.size >= 100

  return (
    <div
      className="flex h-screen overflow-hidden bg-gray-100"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* ── SIDEBAR ── */}
      <aside
        className="flex flex-col bg-gray-900 flex-shrink-0 overflow-hidden"
        style={{ width: effectiveSidebarWidth }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-800 flex-shrink-0 min-w-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          {showLabels && (
            <div className="min-w-0">
              <h1 className="text-white font-bold text-sm truncate">MOM Pro</h1>
              <p className="text-gray-400 text-xs truncate">Meeting Intelligence</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-1.5 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setCurrentPage(item.id); if (item.id !== 'meetings') setOpenMeetingId(null) }}
              title={!showLabels ? item.label : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-100 relative ${
                showLabels ? 'justify-between px-2.5 py-2' : 'justify-center p-2.5'
              } ${
                currentPage === item.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className={`flex items-center ${showLabels ? 'gap-2.5' : ''}`}>
                {item.icon}
                {showLabels && <span className="truncate">{item.label}</span>}
              </div>
              {showLabels && item.id === 'alerts' && alertSummary.total > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center flex-shrink-0 ${
                  alertSummary.critical > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-gray-600 text-gray-300'
                }`}>
                  {alertSummary.total > 99 ? '99+' : alertSummary.total}
                </span>
              )}
              {!showLabels && item.id === 'alerts' && alertSummary.total > 0 && (
                <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  alertSummary.critical > 0 ? 'bg-rose-500' : 'bg-indigo-400'
                }`} />
              )}
            </button>
          ))}
        </nav>

        {/* Bottom: Search + Ollama status + collapse */}
        <div className="border-t border-gray-800 px-1.5 py-2 flex-shrink-0 space-y-1">
          {/* ⌘K search button */}
          <button
            onClick={() => setSearchOpen(true)}
            title={!showLabels ? 'Search (⌘K)' : undefined}
            className={`w-full flex items-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs ${
              showLabels ? 'gap-2 px-2.5 py-1.5' : 'justify-center p-2'
            }`}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            {showLabels && <span className="flex-1 text-left">Search</span>}
            {showLabels && <kbd className="text-[10px] bg-gray-800 border border-gray-700 px-1 rounded font-mono text-gray-500">⌘K</kbd>}
          </button>

          {showLabels && ollamaStatus && (
            <div className={`text-xs flex items-center gap-1.5 px-2 py-1 ${
              ollamaStatus.hasModel ? 'text-emerald-400' : ollamaStatus.available ? 'text-amber-400' : 'text-rose-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                ollamaStatus.hasModel ? 'bg-emerald-400' : ollamaStatus.available ? 'bg-amber-400' : 'bg-rose-400'
              }`} />
              <span className="truncate text-[11px]">
                {ollamaStatus.hasModel ? '✓ qwen2.5:3b' : ollamaStatus.available ? '⚠ no model' : '✗ offline'}
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="w-full flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Sidebar drag handle (only when not collapsed) */}
      {!sidebarCollapsed && <DragHandle onMouseDown={sidebar.handleMouseDown} />}

      {/* ── MAIN AREA ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-10 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="font-semibold text-gray-700">MOM Pro</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium capitalize">{currentPage}</span>
            {openMeetingId && currentPage === 'meetings' && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-600 font-medium">Editor</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {alertSummary.requiresRemark > 0 && (
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                {alertSummary.requiresRemark} remark required
              </span>
            )}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-lg hover:border-gray-300 hover:text-gray-600 transition-colors"
            >
              <Search className="w-3.5 h-3.5" /> Search <kbd className="text-[10px] font-mono bg-gray-100 px-1 rounded">⌘K</kbd>
            </button>
            <button
              onClick={() => setAlertDrawerOpen(true)}
              className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              title="Alerts"
            >
              <BellRing className={`w-4 h-4 ${alertSummary.critical > 0 ? 'text-rose-500' : 'text-gray-500'}`} />
              {alertSummary.total > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center text-white text-[9px] font-bold rounded-full ${
                  alertSummary.critical > 0 ? 'bg-rose-500 animate-pulse' : 'bg-indigo-500'
                }`}>
                  {alertSummary.total > 9 ? '9+' : alertSummary.total}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {currentPage === 'dashboard' && (
            <DashboardPage onOpenMeeting={openMeeting} />
          )}
          {currentPage === 'meetings' && (
            openMeetingId
              ? <MeetingEditor meetingId={openMeetingId} onBack={closeMeeting} initialTab={openMeetingInitialTab as 'overview' | 'recording' | 'transcript' | 'mom' | undefined} />
              : <MeetingsPage onOpenMeeting={openMeeting} />
          )}
          {currentPage === 'tasks' && (
            <TasksPage onOpenMeeting={openMeeting} />
          )}
          {currentPage === 'alerts' && <AlertCenter />}
          {currentPage === 'settings'  && <SettingsPage />}
        </main>
      </div>

      {/* Alert Drawer */}
      <AlertDrawer
        isOpen={alertDrawerOpen}
        onClose={() => setAlertDrawerOpen(false)}
        onOpenAlertCenter={() => { setCurrentPage('alerts'); setAlertDrawerOpen(false) }}
      />

      {/* Global Search */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenMeeting={(id) => { openMeeting(id); setSearchOpen(false) }}
      />

      {/* ARIA Floating Assistant — Phase 25 */}
      <ARIABubble
        pageContext={{
          page: currentPage === 'meetings' && openMeetingId ? 'meeting_room' : currentPage === 'tasks' ? 'task_board' : currentPage === 'alerts' ? 'alert_center' : currentPage === 'settings' ? 'settings' : 'dashboard',
          meetingId: openMeetingId ?? undefined,
          contextLabel: currentPage === 'meetings' && openMeetingId ? 'Meeting Editor' : currentPage === 'tasks' ? 'Task Board' : currentPage === 'alerts' ? 'Alert Centre' : currentPage === 'settings' ? 'Settings' : 'Dashboard',
        }}
      />
    </div>
  )
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'general' | 'alerts' | 'model' | 'google'>('alerts')
  const nav = useResizable({ initial: 200, min: 140, max: 320 })

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'alerts',  label: '🔔 Alerts & Follow-ups' },
    { id: 'model',   label: '🤖 AI Model' },
    { id: 'google',  label: '🔗 Google Workspace' },
  ]

  return (
    <div className="flex h-full overflow-hidden">
      <div
        className="flex flex-col bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden"
        style={{ width: nav.size }}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Settings</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Nav drag handle */}
      <div
        onMouseDown={nav.handleMouseDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 transition-colors duration-150"
      />

      {/* Settings content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-gray-50">
        {activeTab === 'general' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">General Settings</h2>
            <p className="text-sm text-gray-500">General app settings will be added here.</p>
          </div>
        )}
        {activeTab === 'alerts' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Alerts & Follow-ups</h2>
            <p className="text-sm text-gray-500 mb-6">Configure deadline alerts, delegation tracking, and follow-up requirements.</p>
            <AlertsTab />
          </div>
        )}
        {activeTab === 'model' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">AI Model Settings</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-lg">
              <p className="text-sm font-semibold text-gray-800 mb-2">Ollama Model for MOM Generation</p>
              <input
                type="text"
                defaultValue="qwen2.5:3b"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-full"
                readOnly
              />
              <p className="text-xs text-gray-400 mt-2">
                Run <code className="bg-gray-100 px-1 rounded">ollama pull qwen2.5:3b</code> to install.
              </p>
            </div>
          </div>
        )}
        {activeTab === 'google' && (
          <GoogleTab />
        )}
      </div>
    </div>
  )
}

export default App
