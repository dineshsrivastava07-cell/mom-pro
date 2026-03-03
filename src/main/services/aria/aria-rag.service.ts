// ARIA RAG Service — Retrieval-Augmented Generation context engine
// Retrieves and ranks relevant meeting data for ARIA's LLM prompts

import Database from 'better-sqlite3'
import { PageContext, ContextChunk, ChatMessage } from '../../../shared/types/aria.types'

interface FTSRow {
  content_id: string
  source_type: string
  meeting_code: string | null
  content: string
  metadata_json: string | null
}

export class ARIARagService {
  private readonly MAX_CONTEXT_TOKENS = 6000
  private readonly CHARS_PER_TOKEN = 4

  constructor(private db: Database.Database) {}

  // ── Main entry: build context for a user query ─────────────────────────────

  buildContext(
    userQuery: string,
    pageContext: PageContext,
    conversationHistory: ChatMessage[]
  ): { chunks: ContextChunk[]; summary: string; totalTokens: number } {
    const chunks: ContextChunk[] = []

    // PRIORITY 1: Current page context
    const pageChunks = this.getPageContext(pageContext)
    chunks.push(...pageChunks)

    // PRIORITY 2: FTS keyword search
    const searchChunks = this.searchContent(userQuery)
    chunks.push(...searchChunks)

    // PRIORITY 3: Recent meetings context
    const recentChunks = this.getRecentMeetingsContext(3)
    chunks.push(...recentChunks)

    // PRIORITY 4: Extract entities from conversation history
    const convChunks = this.extractConversationContext(conversationHistory)
    chunks.push(...convChunks)

    // Deduplicate by sourceId, keep highest relevance score
    const seen = new Map<string, ContextChunk>()
    for (const chunk of chunks) {
      const existing = seen.get(chunk.sourceId)
      if (!existing || chunk.relevanceScore > existing.relevanceScore) {
        seen.set(chunk.sourceId, chunk)
      }
    }

    // Sort by relevance, trim to token budget
    const sorted = [...seen.values()].sort((a, b) => b.relevanceScore - a.relevanceScore)
    const trimmed: ContextChunk[] = []
    let tokenBudget = this.MAX_CONTEXT_TOKENS

    for (const chunk of sorted) {
      if (chunk.tokenCount <= tokenBudget) {
        trimmed.push(chunk)
        tokenBudget -= chunk.tokenCount
      }
    }

    const totalTokens = this.MAX_CONTEXT_TOKENS - tokenBudget
    const summary = this.buildSummary(trimmed)
    return { chunks: trimmed, summary, totalTokens }
  }

  // ── Build formatted context string for LLM prompt ─────────────────────────

  formatContextForPrompt(chunks: ContextChunk[]): string {
    if (!chunks.length) return ''
    const parts: string[] = ['=== MEETING INTELLIGENCE CONTEXT ===']

    const byType = new Map<string, ContextChunk[]>()
    for (const c of chunks) {
      const list = byType.get(c.sourceType) ?? []
      list.push(c)
      byType.set(c.sourceType, list)
    }

    if (byType.has('meeting')) {
      parts.push('\n[MEETINGS]')
      for (const c of byType.get('meeting')!) parts.push(c.content)
    }
    if (byType.has('mom')) {
      parts.push('\n[MINUTES OF MEETING]')
      for (const c of byType.get('mom')!) parts.push(c.content)
    }
    if (byType.has('task')) {
      parts.push('\n[ACTION ITEMS / TASKS]')
      for (const c of byType.get('task')!) parts.push(c.content)
    }
    if (byType.has('transcript')) {
      parts.push('\n[TRANSCRIPTS]')
      for (const c of byType.get('transcript')!) parts.push(c.content)
    }
    if (byType.has('alert')) {
      parts.push('\n[ALERTS & FOLLOW-UPS]')
      for (const c of byType.get('alert')!) parts.push(c.content)
    }
    parts.push('\n=== END CONTEXT ===\n')
    return parts.join('\n')
  }

  // ── Index content into FTS5 ────────────────────────────────────────────────

  indexMeeting(id: string, title: string, date: string, organizer: string | null, notes: string | null, code: string | null): void {
    const content = [title, organizer, notes].filter(Boolean).join(' ')
    const meta = JSON.stringify({ date, code })
    this.upsertFTS(id, 'meeting', code ?? '', content, meta)
  }

  indexMOM(meetingId: string, markdown: string, code: string | null): void {
    if (!markdown) return
    this.upsertFTS(`mom-${meetingId}`, 'mom', code ?? '', markdown.slice(0, 4000), '{}')
  }

  indexTask(id: string, title: string, assignedTo: string, description: string | null, code: string | null): void {
    const content = [title, assignedTo, description].filter(Boolean).join(' ')
    this.upsertFTS(id, 'task', code ?? '', content, '{}')
  }

  indexTranscript(meetingId: string, transcript: string, code: string | null): void {
    if (!transcript) return
    this.upsertFTS(`transcript-${meetingId}`, 'transcript', code ?? '', transcript.slice(0, 3000), '{}')
  }

  // Rebuild entire FTS index from current DB state
  rebuildFTSIndex(): void {
    try {
      this.db.exec("DELETE FROM aria_fts")
    } catch { /* table might not exist yet */ }

    // Index all meetings
    const meetings = this.db.prepare('SELECT * FROM meetings LIMIT 500').all() as Record<string, unknown>[]
    for (const m of meetings) {
      this.indexMeeting(
        m.id as string, m.title as string, m.scheduled_start as string,
        m.organizer as string | null, m.notes as string | null, m.meeting_code as string | null
      )
      if (m.transcript) this.indexTranscript(m.id as string, m.transcript as string, m.meeting_code as string | null)
    }

    // Index MOMs
    const moms = this.db.prepare('SELECT * FROM mom_documents WHERE generated_markdown IS NOT NULL').all() as Record<string, unknown>[]
    for (const mom of moms) {
      this.indexMOM(mom.meeting_id as string, mom.generated_markdown as string, mom.meeting_code as string | null)
    }

    // Index tasks
    const tasks = this.db.prepare('SELECT * FROM tasks LIMIT 1000').all() as Record<string, unknown>[]
    for (const t of tasks) {
      this.indexTask(t.id as string, t.title as string, t.assigned_to as string, t.description as string | null, t.meeting_code as string | null)
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getPageContext(ctx: PageContext): ContextChunk[] {
    const chunks: ContextChunk[] = []
    if (!ctx.meetingId) return chunks

    try {
      const meeting = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(ctx.meetingId) as Record<string, unknown> | null
      if (!meeting) return chunks

      const tasks = this.db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY deadline ASC LIMIT 20').all(ctx.meetingId) as Record<string, unknown>[]
      const mom = this.db.prepare('SELECT generated_markdown FROM mom_documents WHERE meeting_id = ?').get(ctx.meetingId) as { generated_markdown: string | null } | null

      const content = [
        `CURRENT MEETING: ${meeting.title} (${meeting.meeting_code ?? 'draft'})`,
        `Date: ${meeting.scheduled_start}`,
        `Status: ${meeting.status}`,
        tasks.length ? `\nOpen Tasks (${tasks.length}):\n${tasks.map((t) => `- [${t.status}] ${t.title} → ${t.assigned_to} (${t.deadline ?? 'no deadline'})`).join('\n')}` : '',
        mom?.generated_markdown ? `\nMOM Preview:\n${mom.generated_markdown.slice(0, 800)}…` : '',
      ].filter(Boolean).join('\n')

      chunks.push({
        sourceType: 'meeting', sourceId: ctx.meetingId,
        meetingCode: ctx.meetingCode, content,
        relevanceScore: 1.0,
        tokenCount: Math.ceil(content.length / this.CHARS_PER_TOKEN),
      })
    } catch { /* silently skip if table not ready */ }

    return chunks
  }

  private searchContent(query: string): ContextChunk[] {
    if (!query || query.trim().length < 2) return []
    const chunks: ContextChunk[] = []

    try {
      const ftsQuery = query.trim().replace(/['"*]/g, ' ').split(/\s+/).join(' ')
      const rows = this.db.prepare(
        `SELECT content_id, source_type, meeting_code, content, metadata_json
         FROM aria_fts WHERE content MATCH ? ORDER BY rank LIMIT 8`
      ).all(ftsQuery) as FTSRow[]

      for (const row of rows) {
        const snippet = row.content.slice(0, 600)
        chunks.push({
          sourceType: row.source_type as ContextChunk['sourceType'],
          sourceId: row.content_id,
          meetingCode: row.meeting_code ?? undefined,
          content: snippet,
          relevanceScore: 0.8,
          tokenCount: Math.ceil(snippet.length / this.CHARS_PER_TOKEN),
        })
      }
    } catch { /* FTS table might not be populated yet */ }

    return chunks
  }

  private getRecentMeetingsContext(limit: number): ContextChunk[] {
    const chunks: ContextChunk[] = []
    try {
      const meetings = this.db.prepare(
        `SELECT id, title, meeting_code, scheduled_start, status FROM meetings ORDER BY scheduled_start DESC LIMIT ?`
      ).all(limit) as Record<string, unknown>[]

      for (const m of meetings) {
        const taskCount = (this.db.prepare('SELECT COUNT(*) as c FROM tasks WHERE meeting_id = ?').get(m.id) as { c: number }).c
        const openCount = (this.db.prepare("SELECT COUNT(*) as c FROM tasks WHERE meeting_id = ? AND status != 'completed'").get(m.id) as { c: number }).c
        const content = `Meeting: ${m.title} | Code: ${m.meeting_code ?? 'draft'} | Date: ${m.scheduled_start} | Status: ${m.status} | Tasks: ${taskCount} (${openCount} open)`
        chunks.push({
          sourceType: 'meeting', sourceId: m.id as string,
          meetingCode: m.meeting_code as string | undefined,
          content, relevanceScore: 0.5,
          tokenCount: Math.ceil(content.length / this.CHARS_PER_TOKEN),
        })
      }
    } catch { /* silently skip */ }

    return chunks
  }

  private extractConversationContext(history: ChatMessage[]): ContextChunk[] {
    // Extract meeting codes and task references mentioned in recent turns
    const recent = history.slice(-6)
    const codes = new Set<string>()
    for (const msg of recent) {
      const matches = msg.textContent.matchAll(/MTG-\w+-\d+/g)
      for (const m of matches) codes.add(m[0])
    }
    const chunks: ContextChunk[] = []
    for (const code of codes) {
      try {
        const m = this.db.prepare('SELECT id, title, meeting_code, scheduled_start FROM meetings WHERE meeting_code = ?').get(code) as Record<string, unknown> | null
        if (m) {
          const content = `Previously discussed: ${m.title} (${code}) on ${m.scheduled_start}`
          chunks.push({ sourceType: 'meeting', sourceId: m.id as string, meetingCode: code, content, relevanceScore: 0.6, tokenCount: Math.ceil(content.length / this.CHARS_PER_TOKEN) })
        }
      } catch { /* skip */ }
    }
    return chunks
  }

  private buildSummary(chunks: ContextChunk[]): string {
    const typeCounts = new Map<string, number>()
    for (const c of chunks) typeCounts.set(c.sourceType, (typeCounts.get(c.sourceType) ?? 0) + 1)
    const parts = [...typeCounts.entries()].map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
    return parts.length ? `Using context from: ${parts.join(', ')}` : 'No relevant context found'
  }

  private upsertFTS(id: string, type: string, code: string, content: string, meta: string): void {
    try {
      this.db.prepare('DELETE FROM aria_fts WHERE content_id = ?').run(id)
      this.db.prepare('INSERT INTO aria_fts (content_id, source_type, meeting_code, content, metadata_json) VALUES (?, ?, ?, ?, ?)').run(id, type, code, content, meta)
    } catch { /* skip on error */ }
  }
}
