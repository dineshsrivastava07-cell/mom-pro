// ─── ARIA — Adaptive Real-time Intelligence Assistant ────────────────────────
// Phase 25 Type System

export type MessageRole = 'user' | 'aria' | 'system'
export type MessageStatus = 'sending' | 'streaming' | 'complete' | 'error'

export type MessageContentType =
  | 'text'
  | 'meeting_card'
  | 'task_card'
  | 'timeline_card'
  | 'mom_section'
  | 'action_buttons'
  | 'edit_proposal'
  | 'schedule_card'
  | 'roadmap_card'
  | 'delegation_card'
  | 'alert_card'
  | 'draft_card'
  | 'error_card'

export interface ContentBlock {
  type: MessageContentType
  data: Record<string, unknown>
}

export type ARIAActionType =
  | 'open_meeting'
  | 'open_mom'
  | 'open_task'
  | 'open_alerts'
  | 'mark_task_done'
  | 'reschedule_task'
  | 'reassign_task'
  | 'send_task_email'
  | 'create_meeting'
  | 'reschedule_meeting'
  | 'edit_mom_section'
  | 'accept_edit_proposal'
  | 'reject_edit_proposal'
  | 'confirm_schedule'
  | 'dismiss_alert'
  | 'snooze_alert'
  | 'add_followup_remark'
  | 'copy_to_clipboard'
  | 'send_draft_email'
  | 'open_full_chat'

export type AppPage =
  | 'dashboard'
  | 'meeting_room'
  | 'mom_editor'
  | 'mom_viewer'
  | 'task_board'
  | 'alert_center'
  | 'settings'

export interface PageContext {
  page: AppPage
  meetingId?: string
  meetingCode?: string
  meetingTitle?: string
  momId?: string
  taskId?: string
  alertId?: string
  contextLabel: string
}

export interface ContextChunk {
  sourceType: 'meeting' | 'mom' | 'task' | 'transcript' | 'alert' | 'delegation'
  sourceId: string
  meetingCode?: string
  content: string
  relevanceScore: number
  tokenCount: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  status: MessageStatus
  textContent: string
  contentBlocks: ContentBlock[]
  contextUsed: ContextChunk[]
  contextSummary?: string
  tokensUsed?: number
  modelUsed: 'qwen2.5:3b' | 'gemini'
  processingMs?: number
  language: 'hindi' | 'english' | 'hinglish'
  pageContext: PageContext
  createdAt: Date
}

export interface ChatSession {
  id: string
  pageContext: PageContext
  title: string
  messages: ChatMessage[]
  turnCount: number
  totalTokensUsed: number
  startedAt: Date
  lastMessageAt: Date
  isActive: boolean
}

export type BubbleState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'has_insight'
  | 'recording_active'

export interface ARIAState {
  isOpen: boolean
  bubbleState: BubbleState
  currentSession: ChatSession | null
  sessionHistory: ChatSession[]
  proactiveInsight: string | null
  isMinimized: boolean
  pageContext: PageContext
  unreadCount: number
}

export interface QuickPrompt {
  id: string
  label: string
  fullPrompt: string
  icon: string
  context: AppPage[]
  category: 'meeting' | 'task' | 'timeline' | 'roadmap' | 'draft' | 'general'
}
