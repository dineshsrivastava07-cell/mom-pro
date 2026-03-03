import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, FileText, CheckSquare, Hash, X, Calendar, User, Clock } from 'lucide-react'
import { searchGlobal, SearchResult, DBMeetingRow, DBTaskRow } from '../lib/api'

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  onOpenMeeting: (id: string) => void
}

export function GlobalSearch({ isOpen, onClose, onOpenMeeting }: GlobalSearchProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults(null)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const r = await searchGlobal(q)
      setResults(r)
      setSelectedIndex(0)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void search(query) }, 180)
    return () => clearTimeout(t)
  }, [query, search])

  // Flatten results for keyboard navigation
  type NavItem = { type: 'meeting'; item: DBMeetingRow } | { type: 'task'; item: DBTaskRow } | { type: 'code'; item: { code: string; meeting_code: string; label: string } }

  const navItems: NavItem[] = results ? [
    ...results.meetings.map((m): NavItem => ({ type: 'meeting', item: m })),
    ...results.tasks.map((t): NavItem => ({ type: 'task', item: t })),
    ...results.codes.map((c): NavItem => ({ type: 'code', item: c })),
  ] : []

  const activateItem = useCallback((item: NavItem) => {
    if (item.type === 'meeting') { onOpenMeeting(item.item.id); onClose() }
    else if (item.type === 'task') { onOpenMeeting(item.item.meeting_id); onClose() }
    else if (item.type === 'code') {
      // For codes, we'd need to find the meeting — open by meeting_code search
      onClose()
    }
  }, [onOpenMeeting, onClose])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, navItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && navItems[selectedIndex]) { activateItem(navItems[selectedIndex]) }
  }

  if (!isOpen) return null

  const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const totalResults = (results?.meetings.length ?? 0) + (results?.tasks.length ?? 0) + (results?.codes.length ?? 0)
  let navIdx = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className={`w-5 h-5 flex-shrink-0 ${loading ? 'text-indigo-500 animate-pulse' : 'text-gray-400'}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search meetings, tasks, codes… (⌘K)"
            className="flex-1 text-sm focus:outline-none placeholder-gray-400"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null) }} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:block text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[440px] overflow-y-auto">
          {!query && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              Start typing to search meetings, tasks, and codes…
            </div>
          )}

          {query && query.length < 2 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">Type at least 2 characters</div>
          )}

          {results && totalResults === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No results for "{query}"</div>
          )}

          {results && results.meetings.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Meetings ({results.meetings.length})
              </div>
              {results.meetings.map((m) => {
                const myIdx = navIdx++
                const isSelected = myIdx === selectedIndex
                return (
                  <button
                    key={m.id}
                    onClick={() => { onOpenMeeting(m.id); onClose() }}
                    onMouseEnter={() => setSelectedIndex(myIdx)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <FileText className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>{m.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        {m.meeting_code && <span className="font-mono text-indigo-500">{m.meeting_code}</span>}
                        <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {fmtDate(m.scheduled_start)}</span>
                        <span className={`capitalize ${m.status === 'published' ? 'text-emerald-500' : 'text-amber-500'}`}>{m.status}</span>
                      </div>
                    </div>
                    {isSelected && <span className="text-xs text-indigo-400 flex-shrink-0">↵ open</span>}
                  </button>
                )
              })}
            </div>
          )}

          {results && results.tasks.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Tasks ({results.tasks.length})
              </div>
              {results.tasks.map((t) => {
                const myIdx = navIdx++
                const isSelected = myIdx === selectedIndex
                return (
                  <button
                    key={t.id}
                    onClick={() => { onOpenMeeting(t.meeting_id); onClose() }}
                    onMouseEnter={() => setSelectedIndex(myIdx)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <CheckSquare className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        {t.item_code && <span className="font-mono text-indigo-500">{t.item_code.split('/')[1] ?? t.item_code}</span>}
                        <span className="flex items-center gap-0.5"><User className="w-3 h-3" /> {t.assigned_to}</span>
                        {t.deadline && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {fmtDate(t.deadline)}</span>}
                        <span className="capitalize">{t.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                    {isSelected && <span className="text-xs text-indigo-400 flex-shrink-0">↵ open meeting</span>}
                  </button>
                )
              })}
            </div>
          )}

          {results && results.codes.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Codes ({results.codes.length})
              </div>
              {results.codes.map((c) => {
                const myIdx = navIdx++
                const isSelected = myIdx === selectedIndex
                return (
                  <div
                    key={c.code}
                    onMouseEnter={() => setSelectedIndex(myIdx)}
                    className={`px-4 py-2.5 flex items-center gap-3 ${isSelected ? 'bg-indigo-50' : ''}`}
                  >
                    <Hash className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-500' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{c.code}</span>
                      <span className="text-xs text-gray-500 ml-2">{c.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {query.length >= 2 ? `${totalResults} result${totalResults !== 1 ? 's' : ''}` : ''}
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span><kbd className="bg-white border border-gray-200 px-1 rounded font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="bg-white border border-gray-200 px-1 rounded font-mono">↵</kbd> open</span>
          </div>
        </div>
      </div>
    </div>
  )
}
