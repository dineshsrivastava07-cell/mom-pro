import React, { useState, useEffect, useCallback } from 'react'
import { LayoutDashboard, CalendarDays, CheckSquare, Clock, Users, TrendingUp, FileText, AlertTriangle } from 'lucide-react'
import { dashboardStats, DashboardStats } from '../../lib/api'

interface DashboardPageProps {
  onOpenMeeting: (id: string) => void
}

export function DashboardPage({ onOpenMeeting }: DashboardPageProps): React.JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await dashboardStats()
      setStats(data)
    } catch (e) {
      console.error('[Dashboard] load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const kpis = stats ? [
    { label: 'Total Meetings',    value: stats.totalMeetings,    sub: 'All time',           icon: <CalendarDays className="w-5 h-5" />, color: 'indigo' },
    { label: 'Open Action Items', value: stats.openTasks,        sub: 'Across all MOMs',    icon: <CheckSquare className="w-5 h-5" />,  color: 'amber'  },
    { label: 'Overdue Tasks',     value: stats.overdueTasks,     sub: 'Require attention',  icon: <Clock className="w-5 h-5" />,       color: 'rose'   },
    { label: 'Attendees Tracked', value: stats.uniqueAttendees,  sub: 'Unique people',      icon: <Users className="w-5 h-5" />,       color: 'emerald'},
  ] : [
    { label: 'Total Meetings',    value: '—', sub: 'Loading…',  icon: <CalendarDays className="w-5 h-5" />, color: 'indigo' },
    { label: 'Open Action Items', value: '—', sub: 'Loading…',  icon: <CheckSquare className="w-5 h-5" />,  color: 'amber'  },
    { label: 'Overdue Tasks',     value: '—', sub: 'Loading…',  icon: <Clock className="w-5 h-5" />,       color: 'rose'   },
    { label: 'Attendees Tracked', value: '—', sub: 'Loading…',  icon: <Users className="w-5 h-5" />,       color: 'emerald'},
  ]

  const colorMap: Record<string, string> = {
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    rose:    'bg-rose-50 text-rose-700 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }

  const fmtDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const daysUntil = (iso: string): number => {
    const now = new Date(); now.setHours(0,0,0,0)
    const d = new Date(iso); d.setHours(0,0,0,0)
    return Math.round((d.getTime() - now.getTime()) / 86400000)
  }

  const statusBadge = (status: string): React.JSX.Element => {
    const cfg: Record<string, string> = {
      draft:     'bg-amber-100 text-amber-700',
      published: 'bg-emerald-100 text-emerald-700',
      completed: 'bg-emerald-100 text-emerald-700',
    }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-600" /> Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Overview of meetings, tasks, and follow-ups</p>
        </div>
        {loading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
      </div>

      <div className="flex-1 p-6 space-y-6 min-h-0">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl border p-4 ${colorMap[k.color]}`}>
              <div className="flex items-center gap-2 mb-3">
                {k.icon}
                <span className="text-xs font-semibold opacity-70">{k.label}</span>
              </div>
              <p className="text-3xl font-bold">{k.value}</p>
              <p className="text-xs opacity-60 mt-1">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Overdue warning banner */}
        {stats && stats.overdueTasks > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="text-sm text-rose-700 font-medium">
              {stats.overdueTasks} overdue task{stats.overdueTasks > 1 ? 's' : ''} — check Alert Center for follow-up actions
            </span>
          </div>
        )}

        {/* Two-column: Recent Meetings + Upcoming Deadlines */}
        <div className="grid grid-cols-2 gap-4">
          {/* Recent Meetings */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" /> Recent Meetings
              </span>
              <span className="text-xs text-gray-400">{stats?.recentMeetings?.length ?? 0} records</span>
            </div>
            <div className="divide-y divide-gray-50">
              {!stats || stats.recentMeetings.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">No meetings yet</div>
              ) : stats.recentMeetings.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onOpenMeeting(m.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.title}</p>
                    <p className="text-xs text-gray-400">
                      {m.meeting_code ? <span className="font-mono">{m.meeting_code}</span> : 'Draft'} · {fmtDate(m.scheduled_start)}
                    </p>
                  </div>
                  {statusBadge(m.status)}
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Upcoming Deadlines
              </span>
              <span className="text-xs text-gray-400">{stats?.upcomingDeadlines?.length ?? 0} items</span>
            </div>
            <div className="divide-y divide-gray-50">
              {!stats || stats.upcomingDeadlines.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">No upcoming deadlines</div>
              ) : stats.upcomingDeadlines.map((d) => {
                const days = daysUntil(d.deadline)
                const color = days < 0 ? 'text-rose-600' : days <= 2 ? 'text-rose-500' : days <= 5 ? 'text-amber-600' : 'text-emerald-600'
                return (
                  <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                      <p className="text-xs text-gray-400">{d.assigned_to} · {d.item_code ?? d.meeting_code}</p>
                    </div>
                    <span className={`text-xs font-bold flex-shrink-0 ml-2 ${color}`}>
                      {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? 'today' : `in ${days}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Activity feed placeholder */}
        {stats && stats.totalMeetings === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">Getting Started</span>
            </div>
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <TrendingUp className="w-10 h-10 text-indigo-200" />
              <p className="text-sm text-gray-500 font-medium">Create your first meeting to get started</p>
              <p className="text-xs text-gray-400">Go to Meetings → New Meeting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
