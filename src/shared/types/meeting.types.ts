// Core Meeting & MOM Types for MOM Pro

import { ItemCode, MeetingCode } from '../utils/meeting-code.utils'

export type MeetingMode = 'in-person' | 'virtual' | 'hybrid'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'deferred' | 'cancelled'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Meeting {
  id: string
  title: string
  meetingCode: string       // "MTG-2504-001-PLN" — generated after creation
  meetingCodeData?: MeetingCode
  meetingCodeSequential?: number

  scheduledStart: Date
  scheduledEnd?: Date
  actualStart?: Date
  actualEnd?: Date
  duration?: number          // Minutes

  mode: MeetingMode
  location?: string          // Room name or video link
  attendees: Attendee[]
  organizer: string

  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'

  // AI-generated content
  transcript?: string
  transcriptSource?: 'uploaded' | 'recorded' | 'manual'
  momGenerated: boolean
  momGeneratedAt?: Date

  // Ollama model used for MOM generation
  llmModel: string           // 'qwen2.5:3b' — user-configured

  tags?: string[]
  notes?: string

  createdAt: Date
  updatedAt: Date
}

export interface Attendee {
  id: string
  name: string
  email?: string
  role?: string
  organization?: string
  isExternal: boolean
  attended: boolean
}

export interface Task {
  id: string
  meetingId: string
  meetingCode: string
  itemCode?: ItemCode

  title: string
  description?: string

  assignedTo: string
  assignedToEmail?: string
  assignedBy?: string
  mtgCodeRef: string

  deadline?: Date
  priority: TaskPriority
  status: TaskStatus

  discussedAt?: string       // Timestamp within meeting (e.g. "10:35 AM")

  // Delegation tracking
  wasShared: boolean
  wasDelegated: boolean
  isManual: boolean          // User-added, not AI-extracted

  editHistory?: TaskEdit[]

  createdAt: Date
  updatedAt: Date
}

export interface TaskEdit {
  field: string
  oldValue: unknown
  newValue: unknown
  editedBy: string
  editedAt: Date
  note?: string
}

export interface AgendaItem {
  id: string
  meetingId: string
  itemCode?: ItemCode
  title: string
  discussedAt?: string
  timeAllocated?: number     // Minutes
  status: 'pending' | 'discussed' | 'deferred' | 'skipped'
  notes?: string
  order: number
}

export interface KeyDecision {
  id: string
  meetingId: string
  itemCode?: ItemCode
  decision: string
  decidedBy: string
  decidedAt?: string         // Time within meeting
  impact?: string
  requiresFollowUp: boolean
}

export interface Highlight {
  id: string
  meetingId: string
  itemCode?: ItemCode
  text: string
  speaker?: string
  timestamp?: string
  isKeyPoint: boolean
  type: 'insight' | 'risk' | 'opportunity' | 'concern' | 'general'
}

export interface Timeline {
  id: string
  meetingId: string
  itemCode?: ItemCode
  milestone: string
  dueDate: Date
  owner: string
  linkedTaskIds?: string[]
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed'
}

export interface MOMDocument {
  id: string
  meetingId: string
  meetingCode: string
  version: number

  meeting: Meeting
  agenda: AgendaItem[]
  tasks: Task[]
  keyDecisions: KeyDecision[]
  highlights: Highlight[]
  timelines: Timeline[]

  summary?: string
  nextSteps?: string
  nextMeetingDate?: Date

  generatedMarkdown?: string
  llmModel: string           // 'qwen2.5:3b'

  finalizedAt?: Date
  finalizedBy?: string
  alertsActivated: boolean

  createdAt: Date
  updatedAt: Date
}

// Ollama API types
export interface OllamaGenerateRequest {
  model: string              // 'qwen2.5:3b'
  prompt: string
  stream: boolean
  options?: {
    temperature?: number
    num_ctx?: number
    top_p?: number
  }
}

export interface OllamaGenerateResponse {
  model: string
  response: string
  done: boolean
}
