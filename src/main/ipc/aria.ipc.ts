// ARIA IPC handlers — Phase 25 Floating Meeting Intelligence Assistant
// AI Engine: Gemini 2.0 Flash (primary, via Google OAuth) → Ollama qwen2.5:3b (fallback)
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { ARIARagService } from '../services/aria/aria-rag.service'
import { PageContext, ChatMessage } from '../../shared/types/aria.types'
import { GeminiService } from '../services/google/gemini.service'
import { GoogleAuthService } from '../services/google/google-auth.service'

interface OllamaResponse {
  response?: string
  error?: string
}

const ARIA_SYSTEM_PROMPT = `You are ARIA (Adaptive Real-time Intelligence Assistant), the AI core of MOM Pro — a meeting intelligence platform.

PERSONALITY:
- Efficient, precise Indian corporate professional style
- Bilingual: respond in the same language the user writes in (Hindi, English, or Hinglish)
- Never hallucinate — if you don't know, say so clearly
- Action-oriented: end responses with a clear next step when relevant
- You have deep knowledge of every meeting, MOM, task, and alert in this system

CAPABILITIES:
- Query meeting history, MOMs, tasks, decisions, alerts
- Help draft agendas, summaries, follow-up emails
- Analyze trends across meetings
- Help track action items and deadlines
- Suggest next steps based on meeting context

RESPONSE FORMAT:
- Keep responses concise and structured
- Use bullet points for lists
- Bold key information
- For tasks/deadlines, always show: assignee, deadline, current status
- Always cite the meeting code when referencing specific meetings

You are provided with relevant meeting data in [CONTEXT] below.`

export function initARIAIPC(db: Database.Database): void {
  const ragService = new ARIARagService(db)
  const authService = new GoogleAuthService(db)

  // ── Create / get active session ────────────────────────────────────────────

  ipcMain.handle('aria:get-session', (_e, pageContextJson: string) => {
    const pageContext = JSON.parse(pageContextJson) as PageContext

    // Find active session (started in last 4 hours)
    const active = db.prepare(
      `SELECT * FROM aria_sessions WHERE is_active = 1 AND last_message_at > datetime('now', '-4 hours') ORDER BY last_message_at DESC LIMIT 1`
    ).get() as Record<string, unknown> | null

    if (active) {
      const messages = db.prepare(
        'SELECT * FROM aria_messages WHERE session_id = ? ORDER BY created_at ASC'
      ).all(active.id) as Record<string, unknown>[]

      return { session: mapSession(active), messages: messages.map(mapMessage) }
    }

    // Create new session
    const id = uuidv4()
    db.prepare(
      'INSERT INTO aria_sessions (id, page_context_json, title) VALUES (?, ?, ?)'
    ).run(id, JSON.stringify(pageContext), 'New Chat')

    return { session: { id, pageContext, title: 'New Chat', turnCount: 0, totalTokensUsed: 0 }, messages: [] }
  })

  // ── Send message to ARIA ───────────────────────────────────────────────────

  ipcMain.handle('aria:send-message', async (_e, sessionId: string, userText: string, pageContextJson: string, historyJson: string) => {
    const pageContext = JSON.parse(pageContextJson) as PageContext
    const history = JSON.parse(historyJson) as ChatMessage[]
    const t0 = Date.now()

    // Save user message
    const userMsgId = uuidv4()
    db.prepare(
      `INSERT INTO aria_messages (id, session_id, role, status, text_content, page_context_json) VALUES (?, ?, 'user', 'complete', ?, ?)`
    ).run(userMsgId, sessionId, userText, pageContextJson)

    // Build RAG context
    const { chunks, summary, totalTokens } = ragService.buildContext(userText, pageContext, history)
    const contextStr = ragService.formatContextForPrompt(chunks)

    // Build full prompt (for Ollama fallback — Gemini uses contextStr separately)
    const conversationForLLM = history.slice(-10).map((m) => `${m.role === 'user' ? 'User' : 'ARIA'}: ${m.textContent}`).join('\n')
    const fullOllamaPrompt = [
      ARIA_SYSTEM_PROMPT,
      contextStr ? `\n[CONTEXT]\n${contextStr}` : '',
      pageContext.contextLabel ? `\n[CURRENT PAGE]\nUser is viewing: ${pageContext.contextLabel}` : '',
      conversationForLLM ? `\n[CONVERSATION HISTORY]\n${conversationForLLM}` : '',
      `\nUser: ${userText}\nARIA:`,
    ].filter(Boolean).join('\n')

    let responseText = ''
    let modelUsed: 'qwen2.5:3b' | 'gemini' = 'qwen2.5:3b'

    // ── PRIMARY: Gemini 2.0 Flash via Google OAuth ─────────────────────────
    try {
      if (authService.isSignedIn()) {
        await authService.refreshIfNeeded()   // refreshes stored token if expiring
        const tokens = authService.getSignedInUser()
        if (!tokens?.accessToken) throw new Error('No access token available')

        const geminiService = new GeminiService(tokens.accessToken)
        const result = await geminiService.chat(ARIA_SYSTEM_PROMPT, userText, contextStr)
        if (!result?.text) throw new Error('Gemini returned empty response')

        responseText = result.text.trim()
        modelUsed = 'gemini'
        console.log('[ARIA] Gemini responded OK')
      } else {
        throw new Error('Not signed in to Google — skipping Gemini')
      }
    } catch (geminiErr) {
      console.warn('[ARIA] Gemini unavailable, falling back to Ollama:', String(geminiErr))

      // ── FALLBACK: Ollama qwen2.5:3b ──────────────────────────────────────
      try {
        const resp = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen2.5:3b',
            prompt: fullOllamaPrompt,
            stream: false,
            options: { temperature: 0.3, num_ctx: 8192, top_p: 0.9 },
          }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await resp.json() as OllamaResponse
        responseText = data.response?.trim() ?? 'I encountered an issue generating a response. Please try again.'
        modelUsed = 'qwen2.5:3b'
      } catch {
        responseText = 'ARIA is offline — neither Gemini nor Ollama is reachable. Please sign in to Google for Gemini, or ensure qwen2.5:3b is running via `ollama serve`.'
      }
    }

    const processingMs = Date.now() - t0

    // Save ARIA response (with model_used)
    const ariaMsgId = uuidv4()
    db.prepare(
      `INSERT INTO aria_messages (id, session_id, role, status, text_content, context_used_json, context_summary, tokens_used, processing_ms, page_context_json, model_used) VALUES (?, ?, 'aria', 'complete', ?, ?, ?, ?, ?, ?, ?)`
    ).run(ariaMsgId, sessionId, responseText, JSON.stringify(chunks), summary, totalTokens, processingMs, pageContextJson, modelUsed)

    // Update session metadata
    db.prepare(
      `UPDATE aria_sessions SET turn_count = turn_count + 1, total_tokens_used = total_tokens_used + ?, last_message_at = datetime('now') WHERE id = ?`
    ).run(totalTokens, sessionId)

    return {
      messageId: ariaMsgId,
      text: responseText,
      contextSummary: summary,
      tokensUsed: totalTokens,
      processingMs,
      modelUsed,
    }
  })

  // ── Get session history ────────────────────────────────────────────────────

  ipcMain.handle('aria:get-history', (_e, sessionId: string) => {
    return (db.prepare('SELECT * FROM aria_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Record<string, unknown>[]).map(mapMessage)
  })

  // ── Get past sessions ──────────────────────────────────────────────────────

  ipcMain.handle('aria:get-sessions', () => {
    return (db.prepare('SELECT * FROM aria_sessions ORDER BY last_message_at DESC LIMIT 20').all() as Record<string, unknown>[]).map(mapSession)
  })

  // ── New session ────────────────────────────────────────────────────────────

  ipcMain.handle('aria:new-session', (_e, pageContextJson: string) => {
    // Mark current as inactive
    db.prepare("UPDATE aria_sessions SET is_active = 0 WHERE is_active = 1").run()

    const id = uuidv4()
    const pageContext = JSON.parse(pageContextJson) as PageContext
    db.prepare('INSERT INTO aria_sessions (id, page_context_json, title) VALUES (?, ?, ?)').run(id, pageContextJson, 'New Chat')
    return { id, pageContext, title: 'New Chat', turnCount: 0, totalTokensUsed: 0 }
  })

  // ── Rebuild FTS index ──────────────────────────────────────────────────────

  ipcMain.handle('aria:rebuild-index', () => {
    ragService.rebuildFTSIndex()
    return { success: true }
  })
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function mapSession(r: Record<string, unknown>): object {
  return {
    id: r.id,
    pageContext: JSON.parse(r.page_context_json as string),
    title: r.title,
    turnCount: r.turn_count,
    totalTokensUsed: r.total_tokens_used,
    startedAt: r.started_at,
    lastMessageAt: r.last_message_at,
    isActive: Boolean(r.is_active),
  }
}

function mapMessage(r: Record<string, unknown>): object {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    status: r.status ?? 'complete',
    textContent: r.text_content,
    contentBlocks: JSON.parse((r.content_blocks_json as string) ?? '[]'),
    contextUsed: JSON.parse((r.context_used_json as string) ?? '[]'),
    contextSummary: r.context_summary ?? undefined,
    tokensUsed: r.tokens_used ?? undefined,
    modelUsed: r.model_used ?? 'qwen2.5:3b',
    processingMs: r.processing_ms ?? undefined,
    language: r.language ?? 'english',
    pageContext: r.page_context_json ? JSON.parse(r.page_context_json as string) : { page: 'dashboard', contextLabel: '' },
    createdAt: new Date(r.created_at as string),
  }
}
