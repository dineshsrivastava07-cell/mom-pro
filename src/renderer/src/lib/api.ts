// Typed IPC bridge for renderer — all window.electron.ipcRenderer.invoke calls in one place

const ipc = window.electron.ipcRenderer

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DBMeetingRow {
  id: string
  title: string
  meeting_code: string | null
  meeting_code_sequential: number | null
  scheduled_start: string
  scheduled_end: string | null
  mode: string
  location: string | null
  organizer: string | null
  status: string
  transcript: string | null
  transcript_source: string | null
  mom_generated: number
  mom_generated_at: string | null
  llm_model: string
  tags: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DBAttendeeRow {
  id: string
  meeting_id: string
  name: string
  email: string | null
  role: string | null
  organization: string | null
  is_external: number
  attended: number
}

export interface DBTaskRow {
  id: string
  meeting_id: string
  meeting_code: string
  item_code: string | null
  mtg_code_ref: string | null
  title: string
  description: string | null
  assigned_to: string
  assigned_to_email: string | null
  assigned_by: string | null
  deadline: string | null
  priority: string
  status: string
  discussed_at: string | null
  was_shared: number
  was_delegated: number
  is_manual: number
  created_at: string
  updated_at: string
}

export interface DBAgendaRow {
  id: string
  meeting_id: string
  item_code: string | null
  title: string
  discussed_at: string | null
  time_allocated: number | null
  status: string
  notes: string | null
  sort_order: number
}

export interface DBKeyDecisionRow {
  id: string
  meeting_id: string
  item_code: string | null
  decision: string
  decided_by: string | null
  decided_at: string | null
  impact: string | null
  requires_follow_up: number
}

export interface DBHighlightRow {
  id: string
  meeting_id: string
  item_code: string | null
  text: string
  speaker: string | null
  timestamp: string | null
  is_key_point: number
  type: string
}

export interface DBTimelineRow {
  id: string
  meeting_id: string
  item_code: string | null
  milestone: string
  due_date: string
  owner: string
  linked_task_ids: string
  status: string
}

export interface DBMOMDocumentRow {
  id: string
  meeting_id: string
  meeting_code: string | null
  version: number
  summary: string | null
  next_steps: string | null
  next_meeting_date: string | null
  generated_markdown: string | null
  llm_model: string
  finalized_at: string | null
  finalized_by: string | null
  alerts_activated: number
}

export interface MeetingDetail {
  meeting: DBMeetingRow
  attendees: DBAttendeeRow[]
  tasks: DBTaskRow[]
  agendaItems: DBAgendaRow[]
  keyDecisions: DBKeyDecisionRow[]
  highlights: DBHighlightRow[]
  timelines: DBTimelineRow[]
  momDocument: DBMOMDocumentRow | null
}

export interface DashboardStats {
  totalMeetings: number
  openTasks: number
  overdueTasks: number
  uniqueAttendees: number
  recentMeetings: DBMeetingRow[]
  upcomingDeadlines: { id: string; title: string; deadline: string; assigned_to: string; item_code: string | null; meeting_code: string }[]
}

export interface SearchResult {
  meetings: DBMeetingRow[]
  tasks: DBTaskRow[]
  codes: { code: string; meeting_code: string; item_type: string; label: string }[]
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export const meetingsCreate = (data: {
  title: string; scheduledStart: string; scheduledEnd?: string
  mode: string; location?: string; organizer?: string; tags?: string; notes?: string
  attendees?: { name: string; email?: string; role?: string; organization?: string; isExternal?: boolean }[]
}): Promise<{ meeting: DBMeetingRow; attendees: DBAttendeeRow[] }> =>
  ipc.invoke('meetings:create', data)

export const meetingsGet = (id: string): Promise<MeetingDetail | null> =>
  ipc.invoke('meetings:get', id)

export const meetingsList = (opts?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<DBMeetingRow[]> =>
  ipc.invoke('meetings:list', opts)

export const meetingsUpdate = (id: string, data: Record<string, unknown>): Promise<DBMeetingRow> =>
  ipc.invoke('meetings:update', id, data)

export const meetingsDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('meetings:delete', id)

export const meetingsSaveTranscript = (id: string, transcript: string, source: string): Promise<{ success: boolean }> =>
  ipc.invoke('meetings:save-transcript', id, transcript, source)

export const meetingsFinalize = (id: string, finalizedBy?: string): Promise<{ meetingCode: string; alertsActivated: number; displayLabel: string }> =>
  ipc.invoke('meetings:finalize', id, finalizedBy)

// ── MOM Generation ────────────────────────────────────────────────────────────

export const momGenerateFromTranscript = (meetingId: string, transcript: string): Promise<{
  success: boolean; summary?: string; nextSteps?: string
  agendaCount: number; taskCount: number; decisionCount: number
}> => ipc.invoke('mom:generate-from-transcript', meetingId, transcript)

export const momUpdateMarkdown = (meetingId: string, markdown: string): Promise<{ success: boolean }> =>
  ipc.invoke('mom:update-markdown', meetingId, markdown)

export const momSaveRecordingTranscript = (meetingId: string, transcript: string): Promise<{ success: boolean }> =>
  ipc.invoke('mom:save-recording-transcript', meetingId, transcript)

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasksAdd = (meetingId: string, data: {
  title: string; assignedTo: string; assignedToEmail?: string
  assignedBy?: string; deadline?: string; priority?: string; description?: string
}): Promise<DBTaskRow> => ipc.invoke('tasks:add', meetingId, data)

export const tasksUpdate = (taskId: string, data: Record<string, unknown>): Promise<DBTaskRow> =>
  ipc.invoke('tasks:update', taskId, data)

export const tasksDelete = (taskId: string): Promise<{ success: boolean }> =>
  ipc.invoke('tasks:delete', taskId)

export const tasksList = (opts?: { status?: string; search?: string }): Promise<DBTaskRow[]> =>
  ipc.invoke('tasks:list', opts)

export const tasksStats = (): Promise<{ open: number; overdue: number; completed: number; total: number }> =>
  ipc.invoke('tasks:stats')

export const tasksCreateManual = (data: {
  title: string; assignedTo: string; assignedToEmail?: string
  assignedBy?: string; deadline?: string; priority?: string; description?: string
}): Promise<DBTaskRow> => ipc.invoke('tasks:create-manual', data)

// ── Attendees ─────────────────────────────────────────────────────────────────

export const attendeesAdd = (meetingId: string, data: {
  name: string; email?: string; role?: string; organization?: string; isExternal?: boolean
}): Promise<DBAttendeeRow> => ipc.invoke('attendees:add', meetingId, data)

export const attendeesUpdate = (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> =>
  ipc.invoke('attendees:update', id, data)

export const attendeesDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('attendees:delete', id)

// ── Agenda ────────────────────────────────────────────────────────────────────

export const agendaAdd = (meetingId: string, title: string, timeAllocated?: number): Promise<DBAgendaRow> =>
  ipc.invoke('agenda:add', meetingId, title, timeAllocated)

export const agendaUpdate = (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> =>
  ipc.invoke('agenda:update', id, data)

export const agendaDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('agenda:delete', id)

// ── Decisions ─────────────────────────────────────────────────────────────────

export const decisionsAdd = (meetingId: string, data: {
  decision: string; decidedBy?: string; impact?: string; requiresFollowUp?: boolean
}): Promise<DBKeyDecisionRow> => ipc.invoke('decisions:add', meetingId, data)

export const decisionsUpdate = (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> =>
  ipc.invoke('decisions:update', id, data)

export const decisionsDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('decisions:delete', id)

// ── Highlights ────────────────────────────────────────────────────────────────

export const highlightsAdd = (meetingId: string, data: {
  text: string; speaker?: string; isKeyPoint?: boolean; type?: string
}): Promise<DBHighlightRow> => ipc.invoke('highlights:add', meetingId, data)

export const highlightsUpdate = (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> =>
  ipc.invoke('highlights:update', id, data)

export const highlightsDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('highlights:delete', id)

// ── Timelines ─────────────────────────────────────────────────────────────────

export const timelinesAdd = (meetingId: string, data: {
  milestone: string; dueDate: string; owner: string
}): Promise<DBTimelineRow> => ipc.invoke('timelines:add', meetingId, data)

export const timelinesUpdate = (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> =>
  ipc.invoke('timelines:update', id, data)

export const timelinesDelete = (id: string): Promise<{ success: boolean }> =>
  ipc.invoke('timelines:delete', id)

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const dashboardStats = (): Promise<DashboardStats> =>
  ipc.invoke('dashboard:stats')

// ── Search ────────────────────────────────────────────────────────────────────

export const searchGlobal = (query: string): Promise<SearchResult> =>
  ipc.invoke('search:global', query)
