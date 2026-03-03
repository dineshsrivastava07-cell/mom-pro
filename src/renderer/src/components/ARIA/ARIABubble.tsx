// ARIA Floating Meeting Intelligence Assistant — Phase 25
// Floating bubble + chat panel, ⌘J toggle, bottom-right corner

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, X, Send, Loader2, Plus, ChevronDown, Zap } from 'lucide-react'
import { PageContext } from '../../../../shared/types/aria.types'

const ipc = window.electron.ipcRenderer

interface ARIAMessage {
  id: string
  role: 'user' | 'aria' | 'system'
  textContent: string
  contextSummary?: string
  tokensUsed?: number
  processingMs?: number
  modelUsed?: 'qwen2.5:3b' | 'gemini'
  createdAt: Date | string
}

interface ARIASession {
  id: string
  title: string
  turnCount: number
}

interface ARIABubbleProps {
  pageContext?: Partial<PageContext>
}

const QUICK_PROMPTS = [
  { label: 'Open tasks', prompt: 'What are all my open action items and their deadlines?' },
  { label: 'Recent MOMs', prompt: 'Summarize the key decisions from my last 3 meetings.' },
  { label: 'Overdue tasks', prompt: 'Which tasks are overdue or at risk of being late?' },
  { label: 'Draft summary', prompt: 'Draft a brief executive summary of today\'s meeting.' },
  { label: 'Who owes what', prompt: 'Show me all pending tasks grouped by assignee.' },
]

export function ARIABubble({ pageContext }: ARIABubbleProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<ARIASession | null>(null)
  const [messages, setMessages] = useState<ARIAMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [showQuickPrompts, setShowQuickPrompts] = useState(true)
  const [activeModel, setActiveModel] = useState<'qwen2.5:3b' | 'gemini'>('qwen2.5:3b')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const ctx: PageContext = {
    page: pageContext?.page ?? 'dashboard',
    meetingId: pageContext?.meetingId,
    meetingCode: pageContext?.meetingCode,
    meetingTitle: pageContext?.meetingTitle,
    contextLabel: pageContext?.contextLabel ?? 'Dashboard',
  }

  const ctxJson = JSON.stringify(ctx)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // ⌘J / Ctrl+J keyboard toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setIsOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Initialize session when panel opens
  useEffect(() => {
    if (!isOpen || initialized) return

    const init = async (): Promise<void> => {
      try {
        const result = await ipc.invoke('aria:get-session', ctxJson) as { session: ARIASession; messages: ARIAMessage[] }
        setSession(result.session)
        setMessages(result.messages)
        setInitialized(true)
        if (result.messages.length > 0) setShowQuickPrompts(false)
      } catch (e) {
        console.error('[ARIA] Failed to init session:', e)
      }
    }
    void init()
  }, [isOpen, initialized, ctxJson])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200)
  }, [isOpen])

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || sending) return

    // Lazily initialize session if not yet ready
    let activeSession = session
    if (!activeSession) {
      try {
        const result = await ipc.invoke('aria:get-session', ctxJson) as { session: ARIASession; messages: ARIAMessage[] }
        setSession(result.session)
        setMessages(result.messages)
        setInitialized(true)
        activeSession = result.session
      } catch {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: 'aria' as const,
          textContent: 'Could not connect to ARIA. Please ensure the database is accessible.',
          createdAt: new Date(),
        }])
        return
      }
    }

    const userMsg: ARIAMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      textContent: text.trim(),
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)
    setThinking(true)
    setShowQuickPrompts(false)

    // Add thinking placeholder
    const thinkingId = `thinking-${Date.now()}`
    const thinkingMsg: ARIAMessage = { id: thinkingId, role: 'aria', textContent: '…', createdAt: new Date() }
    setMessages((prev) => [...prev, thinkingMsg])

    try {
      const historyJson = JSON.stringify(messages.slice(-10))
      const result = await ipc.invoke('aria:send-message', activeSession.id, text.trim(), ctxJson, historyJson) as {
        messageId: string; text: string; contextSummary?: string; tokensUsed?: number; processingMs?: number; modelUsed?: string
      }

      // Replace thinking placeholder with real response
      const ariaMsg: ARIAMessage = {
        id: result.messageId,
        role: 'aria',
        textContent: result.text,
        contextSummary: result.contextSummary,
        tokensUsed: result.tokensUsed,
        processingMs: result.processingMs,
        modelUsed: result.modelUsed as 'qwen2.5:3b' | 'gemini' | undefined,
        createdAt: new Date(),
      }
      if (result.modelUsed) setActiveModel(result.modelUsed as 'qwen2.5:3b' | 'gemini')
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat(ariaMsg))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat({
        id: `err-${Date.now()}`,
        role: 'aria',
        textContent: 'I encountered an error. If using Gemini, check your Google sign-in in Settings. Otherwise ensure Ollama is running with qwen2.5:3b.',
        createdAt: new Date(),
      }))
    } finally {
      setSending(false)
      setThinking(false)
    }
  }, [session, sending, messages, ctxJson])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  const handleNewSession = async (): Promise<void> => {
    try {
      const s = await ipc.invoke('aria:new-session', ctxJson) as ARIASession
      setSession(s)
      setMessages([])
      setShowQuickPrompts(true)
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* Floating bubble button */}
      <div
        className="fixed bottom-5 right-5 z-50"
        style={{ pointerEvents: 'all' }}
      >
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            title="ARIA — Meeting Intelligence (⌘J)"
            className="w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          >
            <span className="absolute w-14 h-14 rounded-full bg-indigo-400 animate-ping opacity-30" />
            <MessageSquare className="w-6 h-6 relative z-10" />
          </button>
        )}

        {/* Chat panel */}
        {isOpen && (
          <div className="w-[420px] h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-none">ARIA</p>
                  <p className="text-[10px] text-indigo-200 mt-0.5">Meeting Intelligence · {ctx.contextLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => void handleNewSession()} title="New Chat" className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Quick prompts on new session */}
              {showQuickPrompts && messages.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="bg-indigo-50 rounded-2xl rounded-tl-none px-3 py-2.5 text-sm text-indigo-900 max-w-[280px]">
                      <p className="font-semibold mb-1">Namaste! I'm ARIA.</p>
                      <p className="text-xs text-indigo-700">I have full access to your meetings, MOMs, tasks, and alerts. Ask me anything, or try a quick prompt:</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-10">
                    {QUICK_PROMPTS.map((qp) => (
                      <button
                        key={qp.label}
                        onClick={() => void sendMessage(qp.prompt)}
                        className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.role === 'aria' && (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                  )}
                  <div className={`max-w-[300px] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-gray-100 text-gray-800 rounded-tl-none'
                  }`}>
                    {msg.textContent === '…' ? (
                      <span className="flex gap-1 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.textContent}</p>
                    )}
                    {msg.role === 'aria' && msg.contextSummary && (
                      <p className="text-[10px] text-gray-400 mt-1 border-t border-gray-200 pt-1">{msg.contextSummary}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 px-3 py-2.5 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask ARIA anything… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  disabled={sending}
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || sending}
                  className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-gray-400">
                  ⌘J to toggle · {activeModel === 'gemini' ? '✦ Gemini 2.0 Flash' : 'qwen2.5:3b · offline'}
                </p>
                {session && (
                  <button onClick={() => setShowQuickPrompts((s) => !s)} className="text-[10px] text-gray-400 hover:text-indigo-600 flex items-center gap-0.5">
                    Quick prompts <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {showQuickPrompts && messages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {QUICK_PROMPTS.slice(0, 3).map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => { setShowQuickPrompts(false); void sendMessage(qp.prompt) }}
                      className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
