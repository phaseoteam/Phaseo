import { File } from "expo-file-system";
import type { SQLiteDatabase, SQLiteStatement } from "expo-sqlite";
import { kv } from "@/lib/storage";

/**
 * Perf-build only (see ./index.ts). Every measurement is one logcat line, `[PhaseoPerf] {"event":…}`, under
 * React Native's `ReactNativeJS` tag; scripts/perf/measure.mjs reads them. Driven by deep links such as
 * `phaseo-perf://perf/seed` (see handleLink).
 */
const TAG = "[PhaseoPerf]";
const ORIGIN_KEY = "phaseo.perf.chatOrigin";

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(`${TAG} ${JSON.stringify({ event, at: Date.now(), ...data })}`);
}

const round = (value: number) => Math.round(value * 10) / 10;
const marks = new Map<string, number>();
const counters = new Map<string, number>();
const add = (name: string, value = 1) => counters.set(name, (counters.get(name) ?? 0) + value);
const since = (name: string) => {
  const mark = marks.get(name);
  return mark == null ? null : round(performance.now() - mark);
};

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** Bytes (characters for text) bound to a statement: what crosses into SQLite. */
function paramBytes(params: unknown[]): number {
  let total = 0;
  for (const param of params) {
    if (typeof param === "string") total += param.length;
    else if (param instanceof Uint8Array) total += param.byteLength;
    else if (Array.isArray(param)) total += paramBytes(param);
    else if (param && typeof param === "object") total += paramBytes(Object.values(param));
  }
  return total;
}

const isWrite = (sql: unknown) => typeof sql === "string" && /^\s*(insert|update|delete|replace)\b/i.test(sql);

/** Times synchronous SQLite calls (they block the JS thread) and counts what each write hands to SQLite. */
function attachDb(database: SQLiteDatabase) {
  const target = database as unknown as Record<string, (...args: unknown[]) => unknown>;
  const wrap = (name: string, sync: boolean) => {
    const original = target[name]!.bind(database);
    target[name] = (...args: unknown[]) => {
      if (isWrite(args[0])) { add("sqlite.write.calls"); add("sqlite.write.bytes", paramBytes(args.slice(1))); }
      if (!sync) return original(...args);
      const started = performance.now();
      try { return original(...args); } finally { add("sqlite.sync.ms", performance.now() - started); }
    };
  };
  for (const name of ["runSync", "getAllSync", "getFirstSync", "execSync"]) wrap(name, true);
  for (const name of ["runAsync", "getAllAsync", "getFirstAsync", "execAsync"]) wrap(name, false);
  const statement = (sql: string, created: SQLiteStatement) => {
    const write = isWrite(sql);
    const run = created as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const [name, sync] of [["executeSync", true], ["executeAsync", false]] as const) {
      const original = run[name]!.bind(created);
      run[name] = (...args: unknown[]) => {
        if (write) { add("sqlite.write.calls"); add("sqlite.write.bytes", paramBytes(args)); }
        if (!sync) return original(...args);
        const started = performance.now();
        try { return original(...args); } finally { add("sqlite.sync.ms", performance.now() - started); }
      };
    }
    return created;
  };
  const prepareSync = target.prepareSync!.bind(database);
  target.prepareSync = (sql: unknown) => statement(sql as string, prepareSync(sql) as SQLiteStatement);
  const prepareAsync = target.prepareAsync!.bind(database);
  target.prepareAsync = async (sql: unknown) => statement(sql as string, await (prepareAsync(sql) as Promise<SQLiteStatement>));
}


let origin: string | null = (() => { try { return kv.getItemSync(ORIGIN_KEY) || null; } catch { return null; } })();

// The JS thread's responsiveness: how late a 16 ms timer fires.
let lag: { samples: number[]; last: number; started: number; timer: ReturnType<typeof setTimeout> | undefined } | null = null;
function lagTick() {
  if (!lag) return;
  const now = performance.now();
  lag.samples.push(Math.max(0, now - lag.last - 16));
  lag.last = now;
  lag.timer = setTimeout(lagTick, 16);
}
function lagStart() {
  if (lag?.timer) clearTimeout(lag.timer);
  lag = { samples: [], last: performance.now(), started: performance.now(), timer: undefined };
  lag.timer = setTimeout(lagTick, 16);
}
function lagStop(label: string) {
  if (!lag) return;
  clearTimeout(lag.timer);
  const sorted = [...lag.samples].sort((a, b) => a - b);
  log("lag", { label, seconds: round((performance.now() - lag.started) / 1000), ticks: sorted.length, p50: round(percentile(sorted, 50)), p95: round(percentile(sorted, 95)), p99: round(percentile(sorted, 99)), max: round(sorted.at(-1) ?? 0), over50: sorted.filter((value) => value > 50).length, over100: sorted.filter((value) => value > 100).length, stalledMs: Math.round(sorted.filter((value) => value > 50).reduce((sum, value) => sum + value, 0)) });
  lag = null;
}

/** Logs when the JS thread has kept up for three 16 ms ticks in a row: the screen can respond to touches. */
function whenSettled(event: string, from: string, data: Record<string, unknown>) {
  const start = marks.get(from);
  if (start == null) return;
  let last = performance.now();
  let calm = 0;
  let calmFrom = last;
  const tick = () => {
    const now = performance.now();
    if (now - last - 16 < 20) { if (calm === 0) calmFrom = last; calm += 1; } else calm = 0;
    last = now;
    if (calm >= 3) log(event, { ...data, ms: round(calmFrom - start) });
    else if (now - start < 60_000) setTimeout(tick, 16);
  };
  setTimeout(tick, 16);
}

const counterSnapshot = () => new Map(counters);
const counterDiff = (before: Map<string, number>) => Object.fromEntries([...counters].map(([name, value]) => [name, round(value - (before.get(name) ?? 0))]).filter(([, value]) => value !== 0));

let openChat: string | null = null;
let topLogged = false;
let listRendering: number | null = null;
const streams = new Map<string, { started: number; counters: Map<string, number> }>();

function chatDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/features/chat/db") as typeof import("@/features/chat/db")).db();
}
function notifyChats() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@/features/chat/state") as typeof import("@/features/chat/state")).notifyChats();
}

function fileSize(path: string) {
  try { const file = new File(`file://${path}`); return file.exists ? file.size : 0; } catch { return 0; }
}

function dbStats() {
  const database = chatDb();
  database.execSync("PRAGMA wal_checkpoint(TRUNCATE)");
  const size = fileSize;
  const path = database.databasePath;
  const count = (sql: string) => database.getFirstSync<{ n: number }>(sql)?.n ?? 0;
  log("db", { mb: round(size(path) / 1024 / 1024), walMb: round(size(`${path}-wal`) / 1024 / 1024), chats: count("SELECT count(*) AS n FROM chats"), messages: count("SELECT count(*) AS n FROM messages"), searchRows: count("SELECT count(*) AS n FROM chat_search"), version: database.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version });
}

function parseQuery(query: string | undefined) {
  const params: Record<string, string> = {};
  for (const pair of (query ?? "").split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
  }
  return params;
}

/** `phaseo-perf://perf/<action>?…` deep links drive the tools from adb; other links pass through. */
function handleLink(path: string, initial: boolean): string | null {
  const match = /^(?:[a-z-]+:\/\/)?\/*perf\/([a-z-]+)\/?(?:\?(.*))?$/.exec(path);
  if (!match) return path;
  const [, action, query] = match;
  const params = parseQuery(query);
  const done = initial ? "/chat" : null;
  switch (action) {
    case "seed":
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const seed = require("./seed") as typeof import("./seed");
        const database = chatDb();
        seed.clearChats(database);
        seed.seedStressData(database, log);
        notifyChats();
        dbStats();
      }, 50);
      return done;
    case "clear":
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("./seed") as typeof import("./seed")).clearChats(chatDb());
        notifyChats();
        log("clear.done");
      }, 50);
      return done;
    case "origin":
      origin = params.url || null;
      kv.setItemSync(ORIGIN_KEY, origin ?? "");
      log("origin", { origin });
      return done;
    case "open":
      if (!params.chat) return done;
      tools.chatTapped(params.chat);
      return `/chat/${params.chat}`;
    case "list":
      return "/chat";
    case "mark":
      marks.set(params.name ?? "mark", performance.now());
      log("mark", { name: params.name });
      return done;
    case "lag-start":
      lagStart();
      log("lag.start");
      return done;
    case "lag-stop":
      lagStop(params.label ?? "lag");
      return done;
    case "counts":
      log("counts", { label: params.label, ...Object.fromEntries([...counters].map(([name, value]) => [name, round(value)])) });
      counters.clear();
      return done;
    case "db":
      setTimeout(dbStats, 0);
      return done;
    case "wal-start": {
      // With automatic checkpoints off, the WAL only grows: its size afterwards is every byte SQLite wrote.
      const database = chatDb();
      database.execSync("PRAGMA wal_checkpoint(TRUNCATE)");
      database.execSync("PRAGMA wal_autocheckpoint = 0");
      log("wal.start", { walKb: Math.round(fileSize(`${database.databasePath}-wal`) / 1024) });
      return done;
    }
    case "wal-stop": {
      const database = chatDb();
      const walKb = Math.round(fileSize(`${database.databasePath}-wal`) / 1024);
      database.execSync("PRAGMA wal_autocheckpoint = 1000");
      database.execSync("PRAGMA wal_checkpoint(TRUNCATE)");
      log("wal", { label: params.label, walKb });
      return done;
    }
    default:
      log("unknown", { action });
      return done;
  }
}

export const tools = {
  log,
  count: (name: string, value = 1) => add(name, value),
  attachDb,
  handleLink,
  /** The chat stand-in's origin, when the build has been pointed at one (perf/origin?url=…). */
  chatOrigin: () => origin,
  /** Where chat requests go instead of phaseo.app, and the placeholder credentials the stand-in accepts. */
  chatStandIn: () => (origin ? { origin, headers: { authorization: "Bearer perf-stand-in" } } : null),
  chatListRender() {
    if (listRendering == null) listRendering = performance.now();
  },
  chatListLoaded(rows: number) {
    if (listRendering == null) return;
    log("chatlist.load", { rows, ms: round(performance.now() - listRendering), jsMs: round(performance.now()) });
    listRendering = null;
  },
  chatTapped(chatId: string) {
    marks.set("chat.tap", performance.now());
    marks.delete("scroll.start");
    openChat = chatId;
    topLogged = false;
  },
  /** The conversation's list has rendered its first screen (LegendList onLoad). */
  chatShown(chatId: string, data: Record<string, unknown>) {
    if (openChat !== chatId) return;
    openChat = null;
    log("chat.firstContent", { chatId, ms: since("chat.tap"), ...data });
    whenSettled("chat.interactive", "chat.tap", { chatId });
  },
  /** A turn was rendered; position 0 means the reader reached the start of the chat. */
  turnShown(chatId: string, position: number) {
    if (position !== 0 || topLogged) return;
    topLogged = true;
    log("chat.top", { chatId, ms: since("scroll.start") ?? since("chat.tap") });
  },
  time<T>(event: string, run: () => T, data?: (result: T) => Record<string, unknown>): T {
    const started = performance.now();
    const result = run();
    log(event, { ms: round(performance.now() - started), ...data?.(result) });
    return result;
  },
  streamStarted(messageId: string) {
    streams.set(messageId, { started: performance.now(), counters: counterSnapshot() });
  },
  streamFinished(messageId: string, data: Record<string, unknown>) {
    const stream = streams.get(messageId);
    if (!stream) return;
    streams.delete(messageId);
    log("stream.done", { messageId, ms: Math.round(performance.now() - stream.started), ...counterDiff(stream.counters), ...data });
  },
};

export type PerfTools = typeof tools;
