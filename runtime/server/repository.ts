import { DatabaseSync } from 'node:sqlite'
import type { SubscriptionCacheScope, SubscriptionRuntimeRepository } from '../../src/core/subscription/runtimeRepository'
import { normalizeSubscriptionRequestProfile } from '../../src/core/subscription/requestProfile'
import type { SubscriptionDiff, SubscriptionRequestProfile, SubscriptionSnapshot, SubscriptionSnapshotCandidate } from '../../src/core/subscription/types'

export interface RuntimeHistoryEntry {
  snapshotId: string
  committedAt: string
  quality: SubscriptionSnapshot['quality']
  readyCount: number
  detectedCount: number
}

export interface RuntimeSchedule {
  projectId: string
  sourceId: string
  sourceName: string
  url: string
  requestProfile: SubscriptionRequestProfile
  intervalSeconds: number
  enabled: boolean
  nextRunAt: string
  lastRunAt?: string
}

export interface PendingEmptySnapshot {
  candidate: SubscriptionSnapshotCandidate
  diff: SubscriptionDiff
}

export class SqliteRuntimeRepository implements SubscriptionRuntimeRepository {
  readonly database: InstanceType<typeof DatabaseSync>

  constructor(path = ':memory:', private readonly maxHistoryPerSource = 10) {
    this.database = new DatabaseSync(path)
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS active_snapshots (
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_config_fingerprint TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY (project_id, source_id)
      );
      CREATE TABLE IF NOT EXISTS snapshot_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        UNIQUE (project_id, source_id, snapshot_id)
      );
      CREATE TABLE IF NOT EXISTS pending_empty (
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        PRIMARY KEY (project_id, source_id)
      );
      CREATE TABLE IF NOT EXISTS schedules (
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        url TEXT NOT NULL,
        request_profile TEXT NOT NULL DEFAULT 'auto',
        interval_seconds INTEGER NOT NULL,
        enabled INTEGER NOT NULL,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        PRIMARY KEY (project_id, source_id)
      );
    `)
    const scheduleColumns = this.database.prepare('PRAGMA table_info(schedules)').all() as Array<{ name: string }>
    if (!scheduleColumns.some(({ name }) => name === 'request_profile')) {
      this.database.exec("ALTER TABLE schedules ADD COLUMN request_profile TEXT NOT NULL DEFAULT 'auto'")
    }
  }

  async readActive(scope: SubscriptionCacheScope) {
    const row = this.database.prepare('SELECT snapshot_json FROM active_snapshots WHERE project_id = ? AND source_id = ? AND source_config_fingerprint = ?').get(scope.projectId, scope.sourceId, scope.sourceConfigFingerprint) as { snapshot_json?: string } | undefined
    return row?.snapshot_json ? JSON.parse(row.snapshot_json) as SubscriptionSnapshot : undefined
  }

  async writeActive(scope: SubscriptionCacheScope, snapshot: SubscriptionSnapshot) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`INSERT INTO active_snapshots (project_id, source_id, source_config_fingerprint, snapshot_json, committed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, source_id) DO UPDATE SET source_config_fingerprint = excluded.source_config_fingerprint, snapshot_json = excluded.snapshot_json, committed_at = excluded.committed_at`)
        .run(scope.projectId, scope.sourceId, scope.sourceConfigFingerprint, JSON.stringify(snapshot), snapshot.committedAt)
      this.database.prepare(`INSERT INTO snapshot_history (project_id, source_id, snapshot_id, snapshot_json, committed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, source_id, snapshot_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, committed_at = excluded.committed_at`)
        .run(scope.projectId, scope.sourceId, snapshot.snapshotId, JSON.stringify(snapshot), snapshot.committedAt)
      this.database.prepare(`DELETE FROM snapshot_history WHERE project_id = ? AND source_id = ? AND id NOT IN
        (SELECT id FROM snapshot_history WHERE project_id = ? AND source_id = ? ORDER BY id DESC LIMIT ?)`)
        .run(scope.projectId, scope.sourceId, scope.projectId, scope.sourceId, this.maxHistoryPerSource)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async deleteActive(scope: SubscriptionCacheScope) {
    this.database.prepare('DELETE FROM active_snapshots WHERE project_id = ? AND source_id = ? AND source_config_fingerprint = ?').run(scope.projectId, scope.sourceId, scope.sourceConfigFingerprint)
  }

  async deleteSource(projectId: string, sourceId: string) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('DELETE FROM active_snapshots WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
      this.database.prepare('DELETE FROM snapshot_history WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
      this.database.prepare('DELETE FROM pending_empty WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
      this.database.prepare('DELETE FROM schedules WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async listHistory(projectId: string, sourceId: string): Promise<RuntimeHistoryEntry[]> {
    const rows = this.database.prepare(`SELECT snapshot_json FROM snapshot_history WHERE project_id = ? AND source_id = ? ORDER BY id DESC`).all(projectId, sourceId) as Array<{ snapshot_json: string }>
    return rows.map(({ snapshot_json }) => {
      const snapshot = JSON.parse(snapshot_json) as SubscriptionSnapshot
      return { snapshotId: snapshot.snapshotId, committedAt: snapshot.committedAt, quality: snapshot.quality, readyCount: snapshot.readyCount, detectedCount: snapshot.result.detectedCount }
    })
  }

  async historySnapshot(projectId: string, sourceId: string, snapshotId: string) {
    const row = this.database.prepare('SELECT snapshot_json FROM snapshot_history WHERE project_id = ? AND source_id = ? AND snapshot_id = ?').get(projectId, sourceId, snapshotId) as { snapshot_json?: string } | undefined
    return row?.snapshot_json ? JSON.parse(row.snapshot_json) as SubscriptionSnapshot : undefined
  }

  async clearHistory(projectId: string, sourceId: string) {
    this.database.prepare('DELETE FROM snapshot_history WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
  }

  async savePendingEmpty(projectId: string, sourceId: string, value: PendingEmptySnapshot) {
    this.database.prepare(`INSERT INTO pending_empty (project_id, source_id, value_json) VALUES (?, ?, ?)
      ON CONFLICT(project_id, source_id) DO UPDATE SET value_json = excluded.value_json`).run(projectId, sourceId, JSON.stringify(value))
  }

  async readPendingEmpty(projectId: string, sourceId: string) {
    const row = this.database.prepare('SELECT value_json FROM pending_empty WHERE project_id = ? AND source_id = ?').get(projectId, sourceId) as { value_json?: string } | undefined
    return row?.value_json ? JSON.parse(row.value_json) as PendingEmptySnapshot : undefined
  }

  async clearPendingEmpty(projectId: string, sourceId: string) {
    this.database.prepare('DELETE FROM pending_empty WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
  }

  async upsertSchedule(schedule: RuntimeSchedule) {
    this.database.prepare(`INSERT INTO schedules (project_id, source_id, source_name, url, request_profile, interval_seconds, enabled, next_run_at, last_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, source_id) DO UPDATE SET source_name = excluded.source_name, url = excluded.url,
      request_profile = excluded.request_profile,
      interval_seconds = excluded.interval_seconds, enabled = excluded.enabled, next_run_at = excluded.next_run_at,
      last_run_at = excluded.last_run_at`).run(schedule.projectId, schedule.sourceId, schedule.sourceName, schedule.url, schedule.requestProfile, schedule.intervalSeconds, schedule.enabled ? 1 : 0, schedule.nextRunAt, schedule.lastRunAt ?? null)
  }

  async getSchedule(projectId: string, sourceId: string) {
    const row = this.database.prepare('SELECT project_id, source_id, source_name, url, request_profile, interval_seconds, enabled, next_run_at, last_run_at FROM schedules WHERE project_id = ? AND source_id = ?').get(projectId, sourceId) as Record<string, unknown> | undefined
    return row ? rowToSchedule(row) : undefined
  }

  async deleteSchedule(projectId: string, sourceId: string) {
    this.database.prepare('DELETE FROM schedules WHERE project_id = ? AND source_id = ?').run(projectId, sourceId)
  }

  async dueSchedules(now: string) {
    const rows = this.database.prepare('SELECT project_id, source_id, source_name, url, request_profile, interval_seconds, enabled, next_run_at, last_run_at FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC').all(now) as Array<Record<string, unknown>>
    return rows.map(rowToSchedule)
  }

  async markScheduleRun(projectId: string, sourceId: string, ranAt: string, nextRunAt: string) {
    this.database.prepare('UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE project_id = ? AND source_id = ?').run(ranAt, nextRunAt, projectId, sourceId)
  }

  close() { this.database.close() }
}

function rowToSchedule(row: Record<string, unknown>): RuntimeSchedule {
  return {
    projectId: String(row.project_id), sourceId: String(row.source_id), sourceName: String(row.source_name), url: String(row.url),
    requestProfile: normalizeSubscriptionRequestProfile(row.request_profile),
    intervalSeconds: Number(row.interval_seconds), enabled: Number(row.enabled) === 1, nextRunAt: String(row.next_run_at),
    ...(row.last_run_at ? { lastRunAt: String(row.last_run_at) } : {}),
  }
}
