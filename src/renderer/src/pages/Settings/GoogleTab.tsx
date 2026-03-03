// Google Workspace Settings Tab — simple Sign in with Google
import React, { useState, useEffect } from 'react'
import {
  LogOut, CheckCircle2, AlertTriangle, Loader2,
  Calendar, Mail, ListChecks, RefreshCw, X, Sparkles
} from 'lucide-react'

const ipc = window.electron.ipcRenderer

interface GoogleStatus {
  isConfigured: boolean
  isSignedIn: boolean
  user: { email: string; name: string } | null
}

export function GoogleTab(): React.JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // First-time credential setup (hidden after first use)
  const [showSetup, setShowSetup] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const s = await ipc.invoke('google:get-status') as GoogleStatus
      setStatus(s)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const handleSignIn = async (): Promise<void> => {
    // If not configured, show the one-time setup instead
    if (!status?.isConfigured) {
      setShowSetup(true)
      return
    }
    setError(''); setSigning(true)
    try {
      const result = await ipc.invoke('google:sign-in') as { success: boolean; user?: { email: string; name: string }; error?: string }
      if (result.success) {
        setSuccessMsg(`Signed in as ${result.user?.name}`)
        setShowSetup(false)
        await load()
      } else {
        setError(result.error ?? 'Sign-in failed')
      }
    } catch (e) { setError(String(e)) }
    finally { setSigning(false) }
  }

  const handleSaveAndSignIn = async (): Promise<void> => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both fields are required.')
      return
    }
    setSaving(true); setError('')
    try {
      const saved = await ipc.invoke('google:save-credentials', clientId.trim(), clientSecret.trim()) as { success: boolean; error?: string }
      if (!saved.success) { setError(saved.error ?? 'Could not save'); setSaving(false); return }
      // Credentials saved — now sign in immediately
      const result = await ipc.invoke('google:sign-in') as { success: boolean; user?: { email: string; name: string }; error?: string }
      if (result.success) {
        setSuccessMsg(`Signed in as ${result.user?.name}`)
        setShowSetup(false)
        setClientId(''); setClientSecret('')
        await load()
      } else {
        setError(result.error ?? 'Sign-in failed')
      }
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  const handleSignOut = async (): Promise<void> => {
    await ipc.invoke('google:sign-out')
    setSuccessMsg('')
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-sm font-bold text-gray-800">Google Workspace</h2>
        <p className="text-xs text-gray-500 mt-1">
          Connect your Google account to sync Calendar, send MOMs via Gmail, and push tasks to Google Tasks.
        </p>
      </div>

      {/* ── Main card ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

        {status?.isSignedIn && status.user ? (
          /* ─ Signed in ─ */
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-sm font-bold text-indigo-700">{status.user.name[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{status.user.name}</p>
                <p className="text-xs text-gray-500">{status.user.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium">Connected</span>
                  <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-medium bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
                    <Sparkles className="w-2.5 h-2.5" /> Gemini Active
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>

        ) : !showSetup ? (
          /* ─ Not signed in — big button ─ */
          <div className="p-6 flex flex-col items-center gap-4">
            <button
              onClick={() => void handleSignIn()}
              disabled={signing}
              className="w-full max-w-xs flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold text-sm py-3 px-6 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-40 transition-all shadow-sm"
            >
              {signing ? (
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {signing ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Your browser will open Google's sign-in page
            </p>
          </div>

        ) : (
          /* ─ One-time setup (only if credentials not yet registered) ─ */
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800">One-time Google setup</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Enter your Google OAuth Client ID and Secret once. After this you just click "Sign in with Google" like any other app.
                </p>
              </div>
              <button onClick={() => setShowSetup(false)} className="text-gray-400 hover:text-gray-600 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Client Secret"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => void handleSaveAndSignIn()}
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {saving ? 'Connecting…' : 'Connect Google Account'}
            </button>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <p className="flex-1">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Features ── */}
      {status?.isSignedIn && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Active Features</p>
          {[
            { icon: <Sparkles className="w-4 h-4 text-purple-600" />, title: 'Gemini AI', desc: 'ARIA powered by Gemini 2.0 Flash via your Google account — no separate API key needed' },
            { icon: <Calendar className="w-4 h-4 text-blue-600" />, title: 'Google Calendar', desc: 'Meetings & deadlines synced to your calendar' },
            { icon: <Mail className="w-4 h-4 text-red-500" />, title: 'Gmail', desc: 'Send MOM to attendees via your Gmail' },
            { icon: <ListChecks className="w-4 h-4 text-emerald-600" />, title: 'Google Tasks', desc: 'Action items pushed to Google Tasks' },
            { icon: <RefreshCw className="w-4 h-4 text-indigo-600" />, title: 'Auto Sync', desc: 'Changes propagate to Google Workspace' },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">{f.icon}</div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                <p className="text-xs text-gray-500">{f.desc}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
