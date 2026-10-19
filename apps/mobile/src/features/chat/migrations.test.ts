import { migrateChatDatabase, schemaVersion, SCHEMA_VERSION, type MigrationDatabase } from "./migrations";

// Node's built-in SQLite (with FTS5, like the phone's) runs the real migration SQL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => { exec(sql: string): void; prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown } } };

function open() {
  const raw = new DatabaseSync(":memory:");
  const database: MigrationDatabase = {
    execSync: (sql) => raw.exec(sql),
    getFirstSync: <T,>(sql: string) => (raw.prepare(sql).get() as T | undefined) ?? null,
  };
  return { raw, database };
}

/** The schema version 1 apps created (db.ts before this change), with a chat in it. */
const V1 = `
  CREATE TABLE chats (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', models TEXT NOT NULL DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0, workspace_id TEXT, preview TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE INDEX chats_by_updated ON chats (pinned DESC, updated_at DESC);
  CREATE TABLE messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL, model TEXT, parent_id TEXT, content TEXT NOT NULL DEFAULT '', reasoning TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'done', error TEXT, attachments TEXT NOT NULL DEFAULT '[]', usage TEXT, created_at INTEGER NOT NULL, position INTEGER NOT NULL);
  CREATE INDEX messages_by_chat ON messages (chat_id, position);
  CREATE VIRTUAL TABLE chat_search USING fts5(chat_id UNINDEXED, body, tokenize = 'unicode61 remove_diacritics 2');
  PRAGMA user_version = 1;
  INSERT INTO chats (id, title, models, created_at, updated_at) VALUES ('c1', 'Old chat', '["openai/gpt-6","phaseo/free"]', 1, 2);
  INSERT INTO messages (id, chat_id, role, content, created_at, position) VALUES ('m1', 'c1', 'user', 'Hello', 1, 0);
  INSERT INTO messages (id, chat_id, role, model, parent_id, content, status, error, created_at, position) VALUES ('m2', 'c1', 'assistant', 'openai/gpt-6', 'm1', '', 'error', 'Out of credit', 2, 1);
  INSERT INTO chat_search (chat_id, body) VALUES ('c1', 'Hello');
`;

const columns = (raw: ReturnType<typeof open>["raw"], table: string) => (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string; dflt_value: string | null }[]);

describe("chat database migrations", () => {
  test("a new database gets the whole schema at the latest version", () => {
    const { raw, database } = open();
    expect(migrateChatDatabase(database)).toBe(0);
    expect(schemaVersion(database)).toBe(SCHEMA_VERSION);
    expect(columns(raw, "chats").map((column) => column.name)).toContain("model_settings");
    expect(columns(raw, "messages").map((column) => column.name)).toEqual(expect.arrayContaining(["error_code", "error_status"]));
  });

  test("an existing version 1 database keeps its chats, which start on default model settings", () => {
    const { raw, database } = open();
    raw.exec(V1);
    expect(migrateChatDatabase(database)).toBe(1);
    expect(schemaVersion(database)).toBe(SCHEMA_VERSION);
    expect(raw.prepare("SELECT id, title, models, model_settings FROM chats").all()).toEqual([{ id: "c1", title: "Old chat", models: '["openai/gpt-6","phaseo/free"]', model_settings: "{}" }]);
    expect(raw.prepare("SELECT id, content, error, error_code, error_status FROM messages ORDER BY position").all()).toEqual([
      { id: "m1", content: "Hello", error: null, error_code: null, error_status: null },
      { id: "m2", content: "", error: "Out of credit", error_code: null, error_status: null },
    ]);
    expect(raw.prepare("SELECT chat_id FROM chat_search WHERE chat_search MATCH 'hello'").all()).toEqual([{ chat_id: "c1" }]);
    // Per-model settings save and read back as JSON keyed by model.
    raw.prepare("UPDATE chats SET model_settings = ? WHERE id = ?").run(JSON.stringify({ "openai/gpt-6": { temperature: 0.2 } }), "c1");
    expect(JSON.parse((raw.prepare("SELECT model_settings FROM chats").get() as { model_settings: string }).model_settings)).toEqual({ "openai/gpt-6": { temperature: 0.2 } });
  });

  test("a version 2 database (the app before long-chat support) gains summaries, streamed pieces and the turn index in place", () => {
    const { raw, database } = open();
    raw.exec(V1);
    raw.exec("ALTER TABLE chats ADD COLUMN model_settings TEXT NOT NULL DEFAULT '{}'; ALTER TABLE messages ADD COLUMN error_code TEXT; ALTER TABLE messages ADD COLUMN error_status INTEGER; PRAGMA user_version = 2;");
    raw.prepare("UPDATE messages SET error_code = 'insufficient_credits', error_status = 402 WHERE id = 'm2'").run();
    expect(migrateChatDatabase(database)).toBe(2);
    expect(schemaVersion(database)).toBe(3);
    // Nothing existing changes; answers gain an empty notice.
    expect(raw.prepare("SELECT id, content, error_code, error_status, notice FROM messages ORDER BY position").all()).toEqual([
      { id: "m1", content: "Hello", error_code: null, error_status: null, notice: null },
      { id: "m2", content: "", error_code: "insufficient_credits", error_status: 402, notice: null },
    ]);
    expect(raw.prepare("SELECT chat_id FROM chat_search WHERE chat_search MATCH 'hello'").all()).toEqual([{ chat_id: "c1" }]);
    // Pages of turns read user messages through the partial index.
    const plan = raw.prepare("EXPLAIN QUERY PLAN SELECT position FROM messages WHERE chat_id = 'c1' AND role = 'user' AND position < 10 ORDER BY position DESC LIMIT 21").all() as { detail: string }[];
    expect(plan.map((row) => row.detail).join(" ")).toContain("messages_turns");
    // Summaries and streamed pieces go when their chat or message does.
    raw.exec("PRAGMA foreign_keys = ON");
    raw.prepare("INSERT INTO chat_summaries (chat_id, model, through_position, summary, created_at) VALUES ('c1', 'openai/gpt-6', 0, 'Said hello.', 3)").run();
    raw.prepare("INSERT INTO message_deltas (message_id, seq, content) VALUES ('m2', 0, 'Hi')").run();
    raw.prepare("DELETE FROM messages WHERE id = 'm2'").run();
    expect(raw.prepare("SELECT count(*) AS n FROM message_deltas").get()).toEqual({ n: 0 });
    raw.prepare("DELETE FROM chats WHERE id = 'c1'").run();
    expect(raw.prepare("SELECT count(*) AS n FROM chat_summaries").get()).toEqual({ n: 0 });
  });

  test("running again does nothing", () => {
    const { database } = open();
    migrateChatDatabase(database);
    expect(migrateChatDatabase(database)).toBe(SCHEMA_VERSION);
    expect(schemaVersion(database)).toBe(SCHEMA_VERSION);
  });

  test("a failing step rolls back and leaves the previous version", () => {
    const { raw, database } = open();
    raw.exec(V1);
    // A column the step is about to add already exists, so its ALTER fails part-way.
    raw.exec("ALTER TABLE messages ADD COLUMN error_code TEXT");
    expect(() => migrateChatDatabase(database)).toThrow();
    expect(schemaVersion(database)).toBe(1);
    expect(columns(raw, "chats").map((column) => column.name)).not.toContain("model_settings");
  });
});
