// Google Calendar Service — Phase 26
// Syncs meeting events, task deadlines, timelines to Google Calendar

import { google, Auth } from 'googleapis'
type OAuth2Client = Auth.OAuth2Client

export interface CalendarEventResult {
  eventId: string
  htmlLink: string
  summary: string
}

export class GoogleCalendarService {
  constructor(private auth: OAuth2Client) {}

  // ── Create meeting event ───────────────────────────────────────────────────

  async createMeetingEvent(opts: {
    title: string
    startISO: string
    endISO: string
    location?: string
    description?: string
    attendeeEmails?: string[]
    meetingCode?: string
  }): Promise<CalendarEventResult> {
    const calendar = google.calendar({ version: 'v3', auth: this.auth })

    const event = {
      summary: opts.title + (opts.meetingCode ? ` [${opts.meetingCode}]` : ''),
      location: opts.location,
      description: opts.description ?? `MOM Pro Meeting Reference: ${opts.meetingCode ?? 'draft'}`,
      start: { dateTime: opts.startISO, timeZone: 'Asia/Kolkata' },
      end: { dateTime: opts.endISO ?? new Date(new Date(opts.startISO).getTime() + 60 * 60000).toISOString(), timeZone: 'Asia/Kolkata' },
      attendees: opts.attendeeEmails?.map((email) => ({ email })) ?? [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }

    const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
    return { eventId: data.id ?? '', htmlLink: data.htmlLink ?? '', summary: data.summary ?? '' }
  }

  // ── Create task deadline reminder ──────────────────────────────────────────

  async createTaskReminder(opts: {
    taskTitle: string
    assignedTo: string
    deadlineISO: string
    meetingCode: string
    itemCode?: string
  }): Promise<CalendarEventResult> {
    const calendar = google.calendar({ version: 'v3', auth: this.auth })

    const deadlineDate = new Date(opts.deadlineISO)
    const endDate = new Date(deadlineDate.getTime() + 30 * 60000)

    const event = {
      summary: `[DEADLINE] ${opts.taskTitle}`,
      description: `Action item from ${opts.meetingCode}\nAssigned to: ${opts.assignedTo}${opts.itemCode ? `\nItem Code: ${opts.itemCode}` : ''}\n\nManaged by MOM Pro`,
      start: { dateTime: deadlineDate.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Kolkata' },
      colorId: '11',  // Red — deadline
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    }

    const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
    return { eventId: data.id ?? '', htmlLink: data.htmlLink ?? '', summary: data.summary ?? '' }
  }

  // ── Create timeline milestone ──────────────────────────────────────────────

  async createMilestoneEvent(opts: {
    milestone: string
    dueDateISO: string
    owner: string
    meetingCode: string
  }): Promise<CalendarEventResult> {
    const calendar = google.calendar({ version: 'v3', auth: this.auth })

    const date = new Date(opts.dueDateISO)
    const endDate = new Date(date.getTime() + 30 * 60000)

    const event = {
      summary: `[MILESTONE] ${opts.milestone}`,
      description: `Timeline milestone from ${opts.meetingCode}\nOwner: ${opts.owner}\n\nManaged by MOM Pro`,
      start: { dateTime: date.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Kolkata' },
      colorId: '9',  // Blueberry
    }

    const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
    return { eventId: data.id ?? '', htmlLink: data.htmlLink ?? '', summary: data.summary ?? '' }
  }
}
