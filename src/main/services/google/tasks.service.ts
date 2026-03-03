// Google Tasks Service — Phase 26
// Sync MOM Pro action items to Google Tasks

import { google, Auth } from 'googleapis'
type OAuth2Client = Auth.OAuth2Client

export interface GoogleTaskResult {
  taskId: string
  title: string
  webViewLink?: string
}

export class GoogleTasksService {
  private listId: string | null = null

  constructor(private auth: OAuth2Client) {}

  // ── Get or create MOM Pro task list ───────────────────────────────────────

  private async getOrCreateTaskList(): Promise<string> {
    if (this.listId) return this.listId

    const tasks = google.tasks({ version: 'v1', auth: this.auth })
    const { data: lists } = await tasks.tasklists.list()

    const existing = lists.items?.find((l) => l.title === 'MOM Pro Action Items')
    if (existing?.id) {
      this.listId = existing.id
      return this.listId
    }

    const { data: newList } = await tasks.tasklists.insert({
      requestBody: { title: 'MOM Pro Action Items' },
    })
    this.listId = newList.id ?? ''
    return this.listId
  }

  // ── Create task ────────────────────────────────────────────────────────────

  async createTask(opts: {
    title: string
    notes?: string
    deadline?: string
    meetingCode: string
    itemCode?: string
    assignedTo: string
  }): Promise<GoogleTaskResult> {
    const tasks = google.tasks({ version: 'v1', auth: this.auth })
    const listId = await this.getOrCreateTaskList()

    const notes = [
      opts.notes ?? '',
      `Meeting: ${opts.meetingCode}`,
      opts.itemCode ? `Code: ${opts.itemCode}` : '',
      `Assigned to: ${opts.assignedTo}`,
      `Source: MOM Pro`,
    ].filter(Boolean).join('\n')

    const task = {
      title: opts.title,
      notes,
      due: opts.deadline ? new Date(opts.deadline).toISOString() : undefined,
    }

    const { data } = await tasks.tasks.insert({ tasklist: listId, requestBody: task })
    return { taskId: data.id ?? '', title: data.title ?? '', webViewLink: data.selfLink ?? undefined }
  }

  // ── Update task status ────────────────────────────────────────────────────

  async completeTask(taskId: string): Promise<void> {
    const tasks = google.tasks({ version: 'v1', auth: this.auth })
    const listId = await this.getOrCreateTaskList()
    await tasks.tasks.patch({
      tasklist: listId,
      task: taskId,
      requestBody: { status: 'completed' },
    })
  }

  // ── Sync all tasks from a meeting ─────────────────────────────────────────

  async syncMeetingTasks(meetingTasks: Array<{
    title: string
    assignedTo: string
    deadline?: string
    description?: string
    meetingCode: string
    itemCode?: string
  }>): Promise<GoogleTaskResult[]> {
    const results: GoogleTaskResult[] = []
    for (const task of meetingTasks) {
      try {
        const result = await this.createTask(task)
        results.push(result)
      } catch { /* skip individual task failures */ }
    }
    return results
  }
}
