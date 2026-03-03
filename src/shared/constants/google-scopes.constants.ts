/**
 * All Google OAuth2 scopes required by MOM Pro.
 * These are requested in a SINGLE consent screen — user grants all at once.
 * Grouped by service for clarity.
 */
export const GOOGLE_OAUTH_SCOPES = [
  // ── IDENTITY ONLY — non-sensitive, zero verification required ──
  // Gmail/Calendar/Tasks scopes added incrementally when used
  'openid',
  'email',
  'profile',
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
    scopes: ['gmail.send', 'gmail.readonly'],
    label: 'Gmail',
    description: 'Send MOM documents and task reminders via your Gmail.',
    required: false,
  },
  calendar: {
    scopes: ['calendar', 'calendar.events'],
    label: 'Google Calendar',
    description: 'Sync meeting events, deadlines, and milestones to your calendar.',
    required: false,
  },
  tasks: {
    scopes: ['tasks'],
    label: 'Google Tasks',
    description: 'Sync action items to Google Tasks with deadlines and assignees.',
    required: false,
  },
}
