/**
 * Tests only: Node's built-in SQLite (with FTS5 and window functions, like the phone's) behind the part of
 * expo-sqlite's API the chat code uses, so queries run on real SQLite in Jest.
 */
type Raw = { exec(sql: string): void; prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown } };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Raw };

const bind = (params: unknown[]) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params).map((value) => (value === undefined ? null : value));

export function testDatabase() {
  const raw = new DatabaseSync(":memory:");
  const database = {
    raw,
    databasePath: ":memory:",
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, ...params: unknown[]) => raw.prepare(sql).run(...bind(params)),
    getAllSync: <T,>(sql: string, ...params: unknown[]) => raw.prepare(sql).all(...bind(params)) as T[],
    getFirstSync: <T,>(sql: string, ...params: unknown[]) => (raw.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    getAllAsync: async <T,>(sql: string, ...params: unknown[]) => raw.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T,>(sql: string, ...params: unknown[]) => (raw.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    runAsync: async (sql: string, ...params: unknown[]) => raw.prepare(sql).run(...bind(params)),
    withTransactionSync(task: () => void) {
      raw.exec("BEGIN");
      try {
        task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    prepareSync(sql: string) {
      const statement = raw.prepare(sql);
      return { executeSync: (...params: unknown[]) => statement.run(...bind(params)), finalizeSync: () => undefined };
    },
  };
  return database;
}
