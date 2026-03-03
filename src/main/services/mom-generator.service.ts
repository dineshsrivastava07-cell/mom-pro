// Phase 20 Part A — MOM Generator Service
// Generates MOM markdown with meeting codes, item codes, alert schedule
// Uses Ollama qwen2.5:3b for AI-powered generation

import { Meeting, MOMDocument, Task, AgendaItem, Timeline } from '../../shared/types/meeting.types'
import { MONTH_NAMES } from '../../shared/utils/meeting-code.utils'

const OLLAMA_BASE_URL = 'http://localhost:11434'
const MOM_MODEL = 'qwen2.5:3b'  // Strictly qwen2.5:3b per user requirement

export interface MOMGenerationOptions {
  includeCodes: boolean
  includeAlertSchedule: boolean
  model?: string
}

export class MOMGeneratorService {
  private model: string

  constructor(model: string = MOM_MODEL) {
    this.model = model
  }

  // ─── GENERATE MOM VIA OLLAMA qwen2.5:3b ──────────────────────────────────
  async generateMOMFromTranscript(
    transcript: string,
    meeting: Meeting
  ): Promise<Partial<MOMDocument>> {
    const prompt = this.buildMOMPrompt(transcript, meeting)

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_ctx: 8192,
          top_p: 0.9
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama (${this.model}) error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as { response: string; done: boolean }
    return this.parseMOMResponse(data.response, meeting)
  }

  // ─── FORMAT MOM AS MARKDOWN (with codes + alert schedule) ────────────────
  formatMOMAsMarkdown(doc: MOMDocument, opts: MOMGenerationOptions = { includeCodes: true, includeAlertSchedule: true }): string {
    const meeting = doc.meeting
    const meetingDate = new Date(meeting.scheduledStart)
    const dateStr = this.formatDate(meetingDate)
    const timeStr = this.formatTimeRange(meeting)
    const attendeeStr = meeting.attendees
      .filter((a) => a.attended)
      .map((a) => `${a.name}${a.role ? ` (${a.role})` : ''}`)
      .join(', ')

    const lines: string[] = []

    // ── Header ──────────────────────────────────────────────────────────────
    lines.push('# 📋 MINUTES OF MEETING')
    lines.push(`## ${meeting.title}`)
    lines.push('---')
    lines.push('| | |')
    lines.push('|---|---|')
    if (opts.includeCodes) {
      lines.push(`| **Meeting Code** | \`${meeting.meetingCode}\` |`)
    }
    lines.push(`| **Date** | ${dateStr} |`)
    lines.push(`| **Time** | ${timeStr} |`)
    lines.push(`| **Mode** | ${this.formatMode(meeting)} |`)
    lines.push(`| **Attendees** | ${attendeeStr || '—'} |`)
    lines.push(`| **Organizer** | ${meeting.organizer} |`)
    lines.push(`| **Prepared by** | MOM Pro AI · ${this.model} · Generated ${new Date().toLocaleString('en-IN')} |`)
    lines.push('---')
    lines.push('')

    // ── Agenda ───────────────────────────────────────────────────────────────
    if (doc.agenda.length > 0) {
      lines.push('## 📌 MEETING AGENDA')
      lines.push('')
      if (opts.includeCodes) {
        lines.push('| Code | Agenda Item | Status | Time |')
        lines.push('|------|------------|--------|------|')
        for (const item of doc.agenda) {
          const code = item.itemCode ? `\`${item.itemCode.full.split('/')[1]}\`` : '—'
          const status = this.formatAgendaStatus(item.status)
          const time = item.discussedAt ? `(${item.discussedAt})` : '—'
          lines.push(`| ${code} | ${item.title} | ${status} | ${time} |`)
        }
      } else {
        for (const item of doc.agenda) {
          lines.push(`- ${item.title}`)
        }
      }
      lines.push('')
    }

    // ── Key Decisions ─────────────────────────────────────────────────────────
    if (doc.keyDecisions.length > 0) {
      lines.push('## 🔑 KEY DECISIONS & HIGHLIGHTS')
      lines.push('')
      if (opts.includeCodes) {
        lines.push('| Code | Decision | By | At |')
        lines.push('|------|---------|-----|-----|')
        for (const dec of doc.keyDecisions) {
          const code = dec.itemCode ? `\`${dec.itemCode.full.split('/')[1]}\`` : '—'
          lines.push(`| ${code} | **${dec.decision}** | ${dec.decidedBy ?? '—'} | ${dec.decidedAt ?? '—'} |`)
        }
      } else {
        for (const dec of doc.keyDecisions) {
          lines.push(`- **${dec.decision}** — ${dec.decidedBy ?? ''} ${dec.decidedAt ? `(${dec.decidedAt})` : ''}`)
        }
      }
      lines.push('')

      // Key highlights
      const keyHighlights = doc.highlights.filter((h) => h.isKeyPoint)
      for (const h of keyHighlights) {
        const code = h.itemCode ? `\`${h.itemCode.full.split('/')[1]}\`` : ''
        lines.push(`> 🔑 ${code} ${h.timestamp ? `[${h.timestamp}]` : ''} **${h.speaker ?? ''}:** "${h.text}"`)
      }
      if (keyHighlights.length > 0) lines.push('')
    }

    // ── Action Items (grouped by assignee) ────────────────────────────────────
    if (doc.tasks.length > 0) {
      lines.push('## ✅ ACTION ITEMS')
      lines.push('')
      const grouped = this.groupTasksByAssignee(doc.tasks)
      for (const [assignee, tasks] of grouped.entries()) {
        lines.push(`### 👤 ${assignee}`)
        if (opts.includeCodes) {
          lines.push('| Code | Task | Deadline | Priority | Alerts |')
          lines.push('|------|------|----------|----------|--------|')
          for (const task of tasks) {
            const code = task.itemCode ? `\`${task.itemCode.full.split('/')[1]}\`` : '—'
            const deadline = task.deadline
              ? new Date(task.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '⚠️ Not Set'
            const priority = this.formatPriority(task.priority)
            const alerts = opts.includeAlertSchedule && task.deadline
              ? this.buildAlertDatesStr(new Date(task.deadline))
              : '—'
            lines.push(`| ${code} | ${task.title} | ${deadline} | ${priority} | ${alerts} |`)
          }
        } else {
          for (const task of tasks) {
            const deadline = task.deadline
              ? `by ${new Date(task.deadline).toLocaleDateString('en-IN')}`
              : 'No deadline'
            lines.push(`- ${task.title} — ${deadline} (${task.priority})`)
          }
        }
        lines.push('')
      }
    }

    // ── Timelines ──────────────────────────────────────────────────────────────
    if (doc.timelines.length > 0) {
      lines.push('## 📅 TIMELINES & MILESTONES')
      lines.push('')
      if (opts.includeCodes) {
        lines.push('| Code | Milestone | Owner | Due Date | Status |')
        lines.push('|------|-----------|-------|----------|--------|')
        for (const tl of doc.timelines) {
          const code = tl.itemCode ? `\`${tl.itemCode.full.split('/')[1]}\`` : '—'
          const due = new Date(tl.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          lines.push(`| ${code} | ${tl.milestone} | ${tl.owner} | ${due} | ${this.formatTimelineStatus(tl.status)} |`)
        }
      } else {
        for (const tl of doc.timelines) {
          lines.push(`- ${tl.milestone} — ${tl.owner} by ${new Date(tl.dueDate).toLocaleDateString('en-IN')}`)
        }
      }
      lines.push('')
    }

    // ── Alert Schedule ─────────────────────────────────────────────────────────
    if (opts.includeAlertSchedule && doc.tasks.some((t) => t.deadline)) {
      lines.push('## 🔔 ALERT & FOLLOW-UP SCHEDULE')
      lines.push('')
      lines.push('| Item | Task | Owner | Deadline | Alert Dates |')
      lines.push('|------|------|-------|----------|-------------|')
      for (const task of doc.tasks.filter((t) => t.deadline)) {
        const code = task.itemCode ? `\`${task.itemCode.full.split('/')[1]}\`` : '—'
        const deadline = new Date(task.deadline!)
        const deadlineStr = deadline.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        const alertDates = this.buildAlertDatesStr(deadline)
        lines.push(`| ${code} | ${task.title.slice(0, 40)} | ${task.assignedTo} | ${deadlineStr} | ${alertDates} |`)
      }
      lines.push('')
      lines.push('*All alerts fire at 9:00 AM IST. Overdue alerts re-escalate every 2 days.*')
      lines.push('*Follow-up remark required if task is 3+ days overdue.*')
      lines.push('')
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    if (doc.summary) {
      lines.push('## 📝 SUMMARY')
      lines.push('')
      lines.push(doc.summary)
      lines.push('')
    }

    if (doc.nextSteps) {
      lines.push('## ➡️ NEXT STEPS')
      lines.push('')
      lines.push(doc.nextSteps)
      lines.push('')
    }

    if (doc.nextMeetingDate) {
      lines.push(`**Next Meeting:** ${new Date(doc.nextMeetingDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`)
      lines.push('')
    }

    lines.push('---')
    lines.push(`*Generated by MOM Pro · Model: ${this.model} · Meeting Code: ${meeting.meetingCode}*`)

    return lines.join('\n')
  }

  // ─── OLLAMA PROMPT BUILDER ────────────────────────────────────────────────
  private buildMOMPrompt(transcript: string, meeting: Meeting): string {
    return `You are a professional meeting minutes generator for Indian business meetings.

IMPORTANT LANGUAGE RULES:
- The transcript may be in English, Hindi, or mixed Hindi-English (Hinglish / code-switching).
- You MUST output ALL fields in clear, professional English regardless of input language.
- Translate any Hindi or Hinglish phrases to English accurately. Preserve names, product names, and proper nouns as-is.
- Do NOT transliterate — translate to meaningful English.

Meeting: ${meeting.title}
Date: ${new Date(meeting.scheduledStart).toLocaleDateString('en-IN')}
Attendees: ${meeting.attendees.map((a) => a.name).join(', ')}

Transcript:
${transcript}

Extract and return a JSON object with these exact keys:
- summary: 2-3 sentence professional summary of what was discussed and decided (in English)
- agenda: Array of {title, status} — agenda items covered ("discussed"/"deferred"/"pending")
- keyDecisions: Array of {decision, decidedBy, decidedAt} — important decisions made
- tasks: Array of {title, assignedTo, deadline (ISO date or null), priority ("critical"/"high"/"medium"/"low"), description, discussedAt} — ALL action items with clear owners
- highlights: Array of {text, speaker, isKeyPoint} — key statements worth capturing
- timelines: Array of {milestone, dueDate (ISO date), owner} — project milestones if mentioned
- nextSteps: Clear next steps paragraph (in English)
- nextMeetingDate: ISO date string or null

Rules:
- Extract EVERY action item and assign it to the correct person mentioned
- If a deadline is mentioned (e.g. "by Friday", "next week", "end of month") convert it to an ISO date relative to ${new Date(meeting.scheduledStart).toISOString().split('T')[0]}
- Priority: "critical" if urgent/immediate, "high" if this week, "medium" if this month, "low" otherwise
- Return ONLY valid JSON. No markdown fences, no explanation text outside the JSON.`
  }

  // ─── PARSE OLLAMA RESPONSE ────────────────────────────────────────────────
  private parseMOMResponse(response: string, _meeting: Meeting): Partial<MOMDocument> {
    try {
      // Extract JSON from response (sometimes wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[0] : response
      const parsed = JSON.parse(jsonStr)

      return {
        summary: parsed.summary,
        nextSteps: parsed.nextSteps,
        nextMeetingDate: parsed.nextMeetingDate ? new Date(parsed.nextMeetingDate) : undefined,
        agenda: (parsed.agenda ?? []).map((a: Record<string, string>, i: number) => ({
          id: `agn-${i}`,
          meetingId: '',
          title: a.title,
          status: a.status ?? 'discussed',
          order: i
        })),
        keyDecisions: (parsed.keyDecisions ?? []).map((d: Record<string, string>, i: number) => ({
          id: `dec-${i}`,
          meetingId: '',
          decision: d.decision,
          decidedBy: d.decidedBy,
          decidedAt: d.decidedAt,
          requiresFollowUp: false
        })),
        tasks: (parsed.tasks ?? []).map((t: Record<string, unknown>, i: number) => ({
          id: `act-${i}`,
          meetingId: '',
          meetingCode: '',
          mtgCodeRef: '',
          title: t.title as string,
          assignedTo: t.assignedTo as string,
          deadline: t.deadline ? new Date(t.deadline as string) : undefined,
          priority: (t.priority as Task['priority']) ?? 'medium',
          status: 'pending' as Task['status'],
          discussedAt: t.discussedAt as string | undefined,
          wasShared: false,
          wasDelegated: false,
          isManual: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })),
        highlights: (parsed.highlights ?? []).map((h: Record<string, unknown>, i: number) => ({
          id: `hlt-${i}`,
          meetingId: '',
          text: h.text as string,
          speaker: h.speaker as string | undefined,
          timestamp: h.timestamp as string | undefined,
          isKeyPoint: !!(h.isKeyPoint as boolean),
          type: 'general' as const
        })),
        timelines: (parsed.timelines ?? []).map((tl: Record<string, string>, i: number) => ({
          id: `tl-${i}`,
          meetingId: '',
          milestone: tl.milestone,
          dueDate: new Date(tl.dueDate),
          owner: tl.owner,
          status: 'on_track' as const
        }))
      }
    } catch {
      console.error('[MOMGenerator] Failed to parse Ollama response:', response.slice(0, 200))
      return { summary: response }
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private buildAlertDatesStr(deadline: Date): string {
    const fmt = (d: Date) =>
      `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`

    const w = new Date(deadline); w.setDate(w.getDate() - 7)
    const d2 = new Date(deadline); d2.setDate(d2.getDate() - 2)
    const d1 = new Date(deadline); d1.setDate(d1.getDate() - 1)

    return `⏰ ${fmt(w)} · ⚠️ ${fmt(d2)} · 🔴 ${fmt(d1)} · 🚨 ${fmt(deadline)}`
  }

  private groupTasksByAssignee(tasks: Task[]): Map<string, Task[]> {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const existing = map.get(task.assignedTo) ?? []
      map.set(task.assignedTo, [...existing, task])
    }
    return map
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('en-IN', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    })
  }

  private formatTimeRange(meeting: Meeting): string {
    const start = new Date(meeting.scheduledStart)
    const end = meeting.scheduledEnd ? new Date(meeting.scheduledEnd) : null
    const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    const dur = meeting.duration ? ` (${Math.floor(meeting.duration / 60)}h ${meeting.duration % 60}m)` : ''
    return `${fmt(start)}${end ? ` – ${fmt(end)}` : ''} IST${dur}`
  }

  private formatMode(meeting: Meeting): string {
    const labels = { 'in-person': 'In-Person', virtual: 'Virtual', hybrid: 'Hybrid' }
    const mode = labels[meeting.mode] ?? meeting.mode
    return meeting.location ? `${mode} · ${meeting.location}` : mode
  }

  private formatAgendaStatus(status: AgendaItem['status']): string {
    const labels = {
      pending: '⏳ Pending',
      discussed: '✓ Discussed',
      deferred: '↩ Deferred',
      skipped: '✗ Skipped'
    }
    return labels[status] ?? status
  }

  private formatPriority(priority: Task['priority']): string {
    const labels = { critical: '🔴 Critical', high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }
    return labels[priority] ?? priority
  }

  private formatTimelineStatus(status: Timeline['status']): string {
    const labels = {
      on_track: '🟢 On Track',
      at_risk: '🟡 At Risk',
      delayed: '🔴 Delayed',
      completed: '✅ Done'
    }
    return labels[status] ?? status
  }

  // ─── OLLAMA HEALTH CHECK ──────────────────────────────────────────────────
  static async checkOllamaAvailable(): Promise<{ available: boolean; hasModel: boolean }> {
    try {
      const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (!resp.ok) return { available: false, hasModel: false }
      const data = await resp.json() as { models: { name: string }[] }
      const hasModel = data.models.some((m) => m.name.includes('qwen2.5:3b'))
      return { available: true, hasModel }
    } catch {
      return { available: false, hasModel: false }
    }
  }
}
