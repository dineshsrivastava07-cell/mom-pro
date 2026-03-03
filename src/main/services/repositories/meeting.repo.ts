// Meeting Repository — full CRUD for meetings, attendees, tasks, agenda, decisions, highlights, timelines
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface DBMeeting {
  id: string
  title: string
  meeting_code: string | null
  meeting_code_sequential: number | null
  scheduled_start: string
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  duration: number | null
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

export interface DBAttendee {
  id: string
  meeting_id: string
  name: string
  email: string | null
  role: string | null
  organization: string | null
  is_external: number
  attended: number
}

export interface DBTask {
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
  edit_history: string
  created_at: string
  updated_at: string
}

export interface DBAgendaItem {
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

export interface DBKeyDecision {
  id: string
  meeting_id: string
  item_code: string | null
  decision: string
  decided_by: string | null
  decided_at: string | null
  impact: string | null
  requires_follow_up: number
}

export interface DBHighlight {
  id: string
  meeting_id: string
  item_code: string | null
  text: string
  speaker: string | null
  timestamp: string | null
  is_key_point: number
  type: string
}

export interface DBTimeline {
  id: string
  meeting_id: string
  item_code: string | null
  milestone: string
  due_date: string
  owner: string
  linked_task_ids: string
  status: string
}

export interface DBMOMDocument {
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
  created_at: string
  updated_at: string
}

export class MeetingRepository {
  constructor(private db: Database.Database) {}

  // ── Meetings ──────────────────────────────────────────────────────────────

  createMeeting(data: Omit<DBMeeting, 'id' | 'created_at' | 'updated_at'>): DBMeeting {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO meetings (id, title, meeting_code, meeting_code_sequential, scheduled_start,
        scheduled_end, actual_start, actual_end, duration, mode, location, organizer, status,
        transcript, transcript_source, mom_generated, mom_generated_at, llm_model, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, data.meeting_code, data.meeting_code_sequential,
      data.scheduled_start, data.scheduled_end, data.actual_start, data.actual_end,
      data.duration, data.mode, data.location, data.organizer, data.status,
      data.transcript, data.transcript_source, data.mom_generated, data.mom_generated_at,
      data.llm_model, data.tags, data.notes)
    return this.getMeeting(id)!
  }

  getMeeting(id: string): DBMeeting | null {
    return this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as DBMeeting | null
  }

  getMeetingByCode(code: string): DBMeeting | null {
    return this.db.prepare('SELECT * FROM meetings WHERE meeting_code = ?').get(code) as DBMeeting | null
  }

  getAllMeetings(opts?: { status?: string; search?: string; limit?: number; offset?: number }): DBMeeting[] {
    let sql = 'SELECT * FROM meetings WHERE 1=1'
    const params: unknown[] = []
    if (opts?.status) { sql += ' AND status = ?'; params.push(opts.status) }
    if (opts?.search) {
      sql += ' AND (title LIKE ? OR meeting_code LIKE ? OR organizer LIKE ?)'
      params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`)
    }
    sql += ' ORDER BY scheduled_start DESC'
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit) }
    if (opts?.offset) { sql += ' OFFSET ?'; params.push(opts.offset) }
    return this.db.prepare(sql).all(...params) as DBMeeting[]
  }

  updateMeeting(id: string, data: Partial<DBMeeting>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'created_at')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    const values = fields.map((f) => (data as Record<string, unknown>)[f])
    this.db.prepare(`UPDATE meetings SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id)
  }

  deleteMeeting(id: string): void {
    this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
  }

  getMeetingCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM meetings').get() as { c: number }).c
  }

  // ── Attendees ─────────────────────────────────────────────────────────────

  addAttendee(data: Omit<DBAttendee, 'id'>): DBAttendee {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO attendees (id, meeting_id, name, email, role, organization, is_external, attended)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.name, data.email, data.role,
      data.organization, data.is_external, data.attended)
    return { id, ...data }
  }

  getAttendees(meetingId: string): DBAttendee[] {
    return this.db.prepare('SELECT * FROM attendees WHERE meeting_id = ? ORDER BY name').all(meetingId) as DBAttendee[]
  }

  updateAttendee(id: string, data: Partial<DBAttendee>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'meeting_id')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    const values = fields.map((f) => (data as Record<string, unknown>)[f])
    this.db.prepare(`UPDATE attendees SET ${set} WHERE id = ?`).run(...values, id)
  }

  deleteAttendee(id: string): void {
    this.db.prepare('DELETE FROM attendees WHERE id = ?').run(id)
  }

  replaceAttendees(meetingId: string, attendees: Omit<DBAttendee, 'id'>[]): DBAttendee[] {
    this.db.prepare('DELETE FROM attendees WHERE meeting_id = ?').run(meetingId)
    return attendees.map((a) => this.addAttendee(a))
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  addTask(data: Omit<DBTask, 'id' | 'created_at' | 'updated_at'>): DBTask {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO tasks (id, meeting_id, meeting_code, item_code, mtg_code_ref, title, description,
        assigned_to, assigned_to_email, assigned_by, deadline, priority, status, discussed_at,
        was_shared, was_delegated, is_manual, edit_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.meeting_code, data.item_code, data.mtg_code_ref,
      data.title, data.description, data.assigned_to, data.assigned_to_email, data.assigned_by,
      data.deadline, data.priority, data.status, data.discussed_at,
      data.was_shared, data.was_delegated, data.is_manual, data.edit_history)
    return this.getTask(id)!
  }

  getTask(id: string): DBTask | null {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DBTask | null
  }

  getTasksByMeeting(meetingId: string): DBTask[] {
    return this.db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY created_at').all(meetingId) as DBTask[]
  }

  getAllTasks(opts?: { status?: string; assignedTo?: string; search?: string }): DBTask[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1'
    const params: unknown[] = []
    if (opts?.status) { sql += ' AND status = ?'; params.push(opts.status) }
    if (opts?.assignedTo) { sql += ' AND assigned_to LIKE ?'; params.push(`%${opts.assignedTo}%`) }
    if (opts?.search) {
      sql += ' AND (title LIKE ? OR assigned_to LIKE ? OR item_code LIKE ?)'
      params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`)
    }
    sql += ' ORDER BY deadline ASC NULLS LAST, created_at DESC'
    return this.db.prepare(sql).all(...params) as DBTask[]
  }

  updateTask(id: string, data: Partial<DBTask>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'created_at')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    const values = fields.map((f) => (data as Record<string, unknown>)[f])
    this.db.prepare(`UPDATE tasks SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id)
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  getTaskStats(): { total: number; open: number; overdue: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status != 'completed' AND status != 'cancelled'").get() as { c: number }).c
    const open = (this.db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending','in_progress')").get() as { c: number }).c
    const overdue = (this.db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending','in_progress') AND deadline < datetime('now')").get() as { c: number }).c
    return { total, open, overdue }
  }

  // ── Agenda Items ──────────────────────────────────────────────────────────

  addAgendaItem(data: Omit<DBAgendaItem, 'id'>): DBAgendaItem {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO agenda_items (id, meeting_id, item_code, title, discussed_at, time_allocated, status, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.item_code, data.title, data.discussed_at,
      data.time_allocated, data.status, data.notes, data.sort_order)
    return { id, ...data }
  }

  getAgendaItems(meetingId: string): DBAgendaItem[] {
    return this.db.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, id').all(meetingId) as DBAgendaItem[]
  }

  updateAgendaItem(id: string, data: Partial<DBAgendaItem>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'meeting_id')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    this.db.prepare(`UPDATE agenda_items SET ${set} WHERE id = ?`)
      .run(...fields.map((f) => (data as Record<string, unknown>)[f]), id)
  }

  deleteAgendaItem(id: string): void {
    this.db.prepare('DELETE FROM agenda_items WHERE id = ?').run(id)
  }

  // ── Key Decisions ─────────────────────────────────────────────────────────

  addKeyDecision(data: Omit<DBKeyDecision, 'id'>): DBKeyDecision {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO key_decisions (id, meeting_id, item_code, decision, decided_by, decided_at, impact, requires_follow_up)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.item_code, data.decision, data.decided_by,
      data.decided_at, data.impact, data.requires_follow_up)
    return { id, ...data }
  }

  getKeyDecisions(meetingId: string): DBKeyDecision[] {
    return this.db.prepare('SELECT * FROM key_decisions WHERE meeting_id = ? ORDER BY id').all(meetingId) as DBKeyDecision[]
  }

  updateKeyDecision(id: string, data: Partial<DBKeyDecision>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'meeting_id')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    this.db.prepare(`UPDATE key_decisions SET ${set} WHERE id = ?`)
      .run(...fields.map((f) => (data as Record<string, unknown>)[f]), id)
  }

  deleteKeyDecision(id: string): void {
    this.db.prepare('DELETE FROM key_decisions WHERE id = ?').run(id)
  }

  // ── Highlights ────────────────────────────────────────────────────────────

  addHighlight(data: Omit<DBHighlight, 'id'>): DBHighlight {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO highlights (id, meeting_id, item_code, text, speaker, timestamp, is_key_point, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.item_code, data.text, data.speaker,
      data.timestamp, data.is_key_point, data.type)
    return { id, ...data }
  }

  getHighlights(meetingId: string): DBHighlight[] {
    return this.db.prepare('SELECT * FROM highlights WHERE meeting_id = ? ORDER BY id').all(meetingId) as DBHighlight[]
  }

  updateHighlight(id: string, data: Partial<DBHighlight>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'meeting_id')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    this.db.prepare(`UPDATE highlights SET ${set} WHERE id = ?`)
      .run(...fields.map((f) => (data as Record<string, unknown>)[f]), id)
  }

  deleteHighlight(id: string): void {
    this.db.prepare('DELETE FROM highlights WHERE id = ?').run(id)
  }

  // ── Timelines ─────────────────────────────────────────────────────────────

  addTimeline(data: Omit<DBTimeline, 'id'>): DBTimeline {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO timelines (id, meeting_id, item_code, milestone, due_date, owner, linked_task_ids, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.meeting_id, data.item_code, data.milestone, data.due_date,
      data.owner, data.linked_task_ids, data.status)
    return { id, ...data }
  }

  getTimelines(meetingId: string): DBTimeline[] {
    return this.db.prepare('SELECT * FROM timelines WHERE meeting_id = ? ORDER BY due_date').all(meetingId) as DBTimeline[]
  }

  updateTimeline(id: string, data: Partial<DBTimeline>): void {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'meeting_id')
    if (!fields.length) return
    const set = fields.map((f) => `${f} = ?`).join(', ')
    this.db.prepare(`UPDATE timelines SET ${set} WHERE id = ?`)
      .run(...fields.map((f) => (data as Record<string, unknown>)[f]), id)
  }

  deleteTimeline(id: string): void {
    this.db.prepare('DELETE FROM timelines WHERE id = ?').run(id)
  }

  // ── MOM Document ──────────────────────────────────────────────────────────

  upsertMOMDocument(data: Omit<DBMOMDocument, 'id' | 'created_at' | 'updated_at'>): DBMOMDocument {
    const existing = this.db.prepare('SELECT id FROM mom_documents WHERE meeting_id = ?').get(data.meeting_id) as { id: string } | null
    if (existing) {
      this.db.prepare(`
        UPDATE mom_documents SET meeting_code=?, version=?, summary=?, next_steps=?,
          next_meeting_date=?, generated_markdown=?, llm_model=?, finalized_at=?,
          finalized_by=?, alerts_activated=?, updated_at=datetime('now')
        WHERE meeting_id=?
      `).run(data.meeting_code, data.version, data.summary, data.next_steps,
        data.next_meeting_date, data.generated_markdown, data.llm_model,
        data.finalized_at, data.finalized_by, data.alerts_activated, data.meeting_id)
      return this.getMOMDocument(data.meeting_id)!
    } else {
      const id = uuidv4()
      this.db.prepare(`
        INSERT INTO mom_documents (id, meeting_id, meeting_code, version, summary, next_steps,
          next_meeting_date, generated_markdown, llm_model, finalized_at, finalized_by, alerts_activated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.meeting_id, data.meeting_code, data.version, data.summary,
        data.next_steps, data.next_meeting_date, data.generated_markdown, data.llm_model,
        data.finalized_at, data.finalized_by, data.alerts_activated)
      return this.getMOMDocument(data.meeting_id)!
    }
  }

  getMOMDocument(meetingId: string): DBMOMDocument | null {
    return this.db.prepare('SELECT * FROM mom_documents WHERE meeting_id = ?').get(meetingId) as DBMOMDocument | null
  }

  // ── Item Code Registry ────────────────────────────────────────────────────

  registerItemCode(code: string, mtgCode: string, itemType: string, itemSequence: number,
    entityTable: string, entityId: string, displayLabel: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO item_code_registry (code, mtg_code, item_type, item_sequence, entity_table, entity_id, display_label)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(code, mtgCode, itemType, itemSequence, entityTable, entityId, displayLabel)
  }

  searchItemCodes(query: string): unknown[] {
    return this.db.prepare(`
      SELECT r.*, m.title as meeting_title, m.scheduled_start as meeting_date
      FROM item_code_registry r
      JOIN meetings m ON m.meeting_code = r.mtg_code
      WHERE r.code LIKE ? OR r.display_label LIKE ? OR r.mtg_code LIKE ?
      ORDER BY m.scheduled_start DESC LIMIT 50
    `).all(`%${query}%`, `%${query}%`, `%${query}%`)
  }

  // ── Unique attendees across all meetings ──────────────────────────────────
  getUniqueAttendeeCount(): number {
    return (this.db.prepare("SELECT COUNT(DISTINCT LOWER(email)) as c FROM attendees WHERE email IS NOT NULL AND email != ''").get() as { c: number }).c
  }

  getRecentMeetings(limit = 5): DBMeeting[] {
    return this.db.prepare('SELECT * FROM meetings ORDER BY scheduled_start DESC LIMIT ?').all(limit) as DBMeeting[]
  }

  getUpcomingDeadlines(limit = 5): DBTask[] {
    return this.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('pending','in_progress') AND deadline IS NOT NULL
      ORDER BY deadline ASC LIMIT ?
    `).all(limit) as DBTask[]
  }
}
