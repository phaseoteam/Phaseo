/** The few synchronous calls migrations need (expo-sqlite's database, or node:sqlite in tests). */
export type MigrationDatabase = {
  execSync(sql: string): void;
  getFirstSync<T>(sql: string): T | null;
};

/**
 * Chats live only on this device, so a schema change bumps `user_version` and migrates the database
 * in place. Each step runs in a transaction; a failed step leaves the previous version intact.
 */
export const SCHEMA_VERSION = 2;

const STEPS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT,
      preview TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chats_by_updated ON chats (pinned DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      model TEXT,
      parent_id TEXT,
      content TEXT NOT NULL DEFAULT '',
      reasoning TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'done',
      error TEXT,
      attachments TEXT NOT NULL DEFAULT '[]',
      usage TEXT,
      created_at INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_by_chat ON messages (chat_id, position);
    CREATE VIRTUAL TABLE IF NOT EXISTS chat_search USING fts5(chat_id UNINDEXED, body, tokenize = 'unicode61 remove_diacritics 2');
  `,
  // Per-model settings for each chat ({ [modelId]: ModelSettings } as JSON; existing chats start on
  // the defaults), and why an answer failed, so its error notice can offer the right next step.
  2: `
    ALTER TABLE chats ADD COLUMN model_settings TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE messages ADD COLUMN error_code TEXT;
    ALTER TABLE messages ADD COLUMN error_status INTEGER;
  `,
};

export function schemaVersion(database: MigrationDatabase) {
  return database.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
}

/** Brings the database up to SCHEMA_VERSION; returns the version it started at. */
export function migrateChatDatabase(database: MigrationDatabase) {
  const start = schemaVersion(database);
  for (let version = start + 1; version <= SCHEMA_VERSION; version += 1) {
    database.execSync("BEGIN IMMEDIATE");
    try {
      database.execSync(`${STEPS[version]}\nPRAGMA user_version = ${version};`);
      database.execSync("COMMIT");
    } catch (error) {
      database.execSync("ROLLBACK");
      throw error;
    }
  }
  return start;
}
