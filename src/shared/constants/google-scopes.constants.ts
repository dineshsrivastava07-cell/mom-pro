/**
 * All Google OAuth2 scopes required by MOM Pro.
 * These are requested in a SINGLE consent screen — user grants all at once.
 * Grouped by service for clarity.
 */
export const GOOGLE_OAUTH_SCOPES = [
  // ── IDENTITY — non-sensitive ──────────────────────────────────────────────
  'openid',
  'email',
  'profile',

  // ── Google Calendar ───────────────────────────────────────────────────────
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',

  // ── Gmail (send-only — not full mailbox access) ───────────────────────────
  'https://www.googleapis.com/auth/gmail.send',

  // ── Google Tasks ──────────────────────────────────────────────────────────
  'https://www.googleapis.com/auth/tasks',

  // ── Gemini AI (Generative Language) ───────────────────────────────────────
  'https://www.googleapis.com/auth/generative-language',
] as const

export type GoogleScope = (typeof GOOGLE_OAUTH_SCOPES)[number]

export const SCOPE_DESCRIPTIONS: Record<string, {
  scopes: string[]
  label: string
  description: string
  required: boolean
}> = {
  identity: {
    scopes: ['openid', 'email', 'profile'],
    label: 'Google Account Login',
    description: 'Sign in with your Google account. Name and email personalise MOM Pro.',
    required: true,
  },
  gmail: {
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    label: 'Gmail',
    description: 'Send MOM documents and task reminders via your Gmail.',
    required: false,
  },
  calendar: {
    scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
    label: 'Google Calendar',
    description: 'Sync meeting events, deadlines, and milestones to your calendar.',
    required: false,
  },
  tasks: {
    scopes: ['https://www.googleapis.com/auth/tasks'],
    label: 'Google Tasks',
    description: 'Sync action items to Google Tasks with deadlines and assignees.',
    required: false,
  },
  gemini: {
    scopes: ['https://www.googleapis.com/auth/generative-language'],
    label: 'Gemini AI',
    description: 'Power ARIA with Gemini 2.0 Flash using your Google account — no separate API key needed.',
    required: false,
  },
}
