// MOM Pro — SQLite Database Layer (better-sqlite3)
// Phases 16-21 schema: meetings, tasks, alerts, delegations, followup_remarks

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db: Database.Database | null = null

export function getDB(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.')
  }
  return db
}

export function initDB(): Database.Database {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'mom-pro-data')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

  const dbPath = join(dbDir, 'mom-pro.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  return db
}

function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)

  const applied = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r: unknown) => (r as { version: number }).version)

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      db.transaction(() => {
        db.exec(migration.sql)
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
      })()
      console.log(`[DB] Applied migration v${migration.version}`)
    }
  }
}

// ─── MIGRATION DEFINITIONS ───────────────────────────────────────────────────

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  // ── v1: Base meetings and tasks ──────────────────────────────────────────
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        meeting_code TEXT,
        meeting_code_sequential INTEGER,
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        duration INTEGER,
        mode TEXT DEFAULT 'in-person',
        location TEXT,
        organizer TEXT,
        status TEXT DEFAULT 'draft',
        transcript TEXT,
        transcript_source TEXT,
        mom_generated INTEGER DEFAULT 0,
        mom_generated_at TEXT,
        llm_model TEXT DEFAULT 'qwen2.5:3b',
        tags TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_code ON meetings(meeting_code)
        WHERE meeting_code IS NOT NULL;

      CREATE TABLE IF NOT EXISTS attendees (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        role TEXT,
        organization TEXT,
        is_external INTEGER DEFAULT 0,
        attended INTEGER DEFAULT 1,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        meeting_code TEXT NOT NULL,
        item_code TEXT,
        mtg_code_ref TEXT,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to TEXT NOT NULL,
        assigned_to_email TEXT,
        assigned_by TEXT,
        deadline TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        discussed_at TEXT,
        was_shared INTEGER DEFAULT 0,
        was_delegated INTEGER DEFAULT 0,
        is_manual INTEGER DEFAULT 0,
        edit_history TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS agenda_items (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        item_code TEXT,
        title TEXT NOT NULL,
        discussed_at TEXT,
        time_allocated INTEGER,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS key_decisions (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        item_code TEXT,
        decision TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        impact TEXT,
        requires_follow_up INTEGER DEFAULT 0,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        item_code TEXT,
        text TEXT NOT NULL,
        speaker TEXT,
        timestamp TEXT,
        is_key_point INTEGER DEFAULT 0,
        type TEXT DEFAULT 'general',
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS timelines (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        item_code TEXT,
        milestone TEXT NOT NULL,
        due_date TEXT NOT NULL,
        owner TEXT NOT NULL,
        linked_task_ids TEXT DEFAULT '[]',
        status TEXT DEFAULT 'on_track',
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mom_documents (
        id TEXT PRIMARY KEY,
        meeting_id TEXT UNIQUE NOT NULL,
        meeting_code TEXT,
        version INTEGER DEFAULT 1,
        summary TEXT,
        next_steps TEXT,
        next_meeting_date TEXT,
        generated_markdown TEXT,
        llm_model TEXT DEFAULT 'qwen2.5:3b',
        finalized_at TEXT,
        finalized_by TEXT,
        alerts_activated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      );

      -- Phase 16: Item code registry (cross-reference lookup)
      CREATE TABLE IF NOT EXISTS item_code_registry (
        code TEXT PRIMARY KEY,
        mtg_code TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_sequence INTEGER NOT NULL,
        entity_table TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        display_label TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (mtg_code) REFERENCES meetings(meeting_code)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE INDEX IF NOT EXISTS idx_registry_mtg  ON item_code_registry(mtg_code);
      CREATE INDEX IF NOT EXISTS idx_registry_type ON item_code_registry(item_type);
    `
  },

  // ── v2: Phase 17 alert tables ────────────────────────────────────────────
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        meeting_code TEXT NOT NULL,
        item_code TEXT NOT NULL,
        meeting_title TEXT NOT NULL,
        meeting_date TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        detail_message TEXT,
        task_id TEXT,
        task_title TEXT,
        assigned_to TEXT NOT NULL,
        assigned_to_email TEXT,
        deadline TEXT,
        scheduled_fire_at TEXT NOT NULL,
        status TEXT DEFAULT 'scheduled',
        fired_at TEXT,
        snooze_until TEXT,
        snooze_count INTEGER DEFAULT 0,
        is_followup_alert INTEGER DEFAULT 0,
        parent_alert_id TEXT,
        followup_remark TEXT,
        requires_followup_remark INTEGER DEFAULT 0,
        is_manual_task INTEGER DEFAULT 0,
        was_shared INTEGER DEFAULT 0,
        was_delegated INTEGER DEFAULT 0,
        delegation_acknowledged INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_fire_at ON alerts(scheduled_fire_at, status);
      CREATE INDEX IF NOT EXISTS idx_alerts_task    ON alerts(task_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_code    ON alerts(meeting_code);
      CREATE INDEX IF NOT EXISTS idx_alerts_status  ON alerts(status);

      CREATE TABLE IF NOT EXISTS followup_remarks (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        remark TEXT NOT NULL,
        remark_by TEXT NOT NULL,
        new_status TEXT NOT NULL,
        new_deadline TEXT,
        impact_note TEXT,
        added_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (alert_id) REFERENCES alerts(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS task_delegations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        meeting_code TEXT NOT NULL,
        delegated_to TEXT NOT NULL,
        delegated_to_email TEXT,
        delegated_by TEXT NOT NULL,
        delegation_method TEXT DEFAULT 'email',
        delegation_note TEXT,
        has_timeline INTEGER DEFAULT 0,
        deadline TEXT,
        acknowledged INTEGER DEFAULT 0,
        acknowledged_at TEXT,
        shared_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_task ON task_delegations(task_id);

      CREATE TABLE IF NOT EXISTS alert_preferences (
        id TEXT PRIMARY KEY DEFAULT 'default',
        preferences_json TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `
  },

  // ── v3: Phase 25 — ARIA tables ───────────────────────────────────────────
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS aria_sessions (
        id TEXT PRIMARY KEY,
        page_context_json TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New Chat',
        turn_count INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0,
        started_at TEXT DEFAULT (datetime('now')),
        last_message_at TEXT DEFAULT (datetime('now')),
        is_active INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_aria_sessions_active ON aria_sessions(is_active, last_message_at);

      CREATE TABLE IF NOT EXISTS aria_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT DEFAULT 'complete',
        text_content TEXT NOT NULL,
        content_blocks_json TEXT DEFAULT '[]',
        context_used_json TEXT DEFAULT '[]',
        context_summary TEXT,
        tokens_used INTEGER,
        model_used TEXT DEFAULT 'qwen2.5:3b',
        processing_ms INTEGER,
        language TEXT DEFAULT 'english',
        page_context_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES aria_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_aria_msgs_session ON aria_messages(session_id, created_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS aria_fts USING fts5(
        content_id,
        source_type,
        meeting_code,
        content,
        metadata_json,
        tokenize = "unicode61 remove_diacritics 1"
      );
    `
  },

  // ── v4: Fix item_code_registry FK mismatch ───────────────────────────────
  // meetings.meeting_code only has a partial UNIQUE INDEX (WHERE meeting_code IS NOT NULL).
  // SQLite cannot use a partial index as an FK target → every INSERT INTO meetings throws
  // "foreign key mismatch". Fix: recreate the table without the problematic FK constraint.
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS item_code_registry_new (
        code TEXT PRIMARY KEY,
        mtg_code TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_sequence INTEGER NOT NULL,
        entity_table TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        display_label TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO item_code_registry_new
        SELECT code, mtg_code, item_type, item_sequence, entity_table, entity_id, display_label, created_at
        FROM item_code_registry;
      DROP TABLE item_code_registry;
      ALTER TABLE item_code_registry_new RENAME TO item_code_registry;
      CREATE INDEX IF NOT EXISTS idx_registry_mtg  ON item_code_registry(mtg_code);
      CREATE INDEX IF NOT EXISTS idx_registry_type ON item_code_registry(item_type);
    `
  }
]

// ─── QUERY HELPERS ────────────────────────────────────────────────────────────

// Get next sequential meeting code number for a given year-month
export function getNextMeetingSequential(db: Database.Database, yearMonth: string): number {
  const result = db
    .prepare(`
      SELECT COALESCE(MAX(meeting_code_sequential), 0) + 1 AS next_seq
      FROM meetings
      WHERE meeting_code LIKE 'MTG-${yearMonth}%'
    `)
    .get() as { next_seq: number }
  return result.next_seq
}

export function closeDB(): void {
  if (db) {
    db.close()
    db = null
  }
}
