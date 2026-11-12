import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { answer, hugeAnswer, question, random, reasoning, type Random } from "./corpus";

/**
 * The stress dataset, modelled on the desktop app's stress fixture: 1,000 chats, one of 2,000 turns
 * (4,000+ messages), one with four models over 500 turns, one with a single ~400 KB answer (long code
 * blocks and a 900-row table), and image attachments in several chats. Deterministic, so every build
 * measures the same data.
 */
export const STRESS = {
  long: { id: "perf-long", title: "Stress: 2,000 turns", turns: 2000, models: ["google/gemma-4-31b:free"] },
  multi: { id: "perf-multi", title: "Stress: 4 models, 500 turns", turns: 500, models: ["openai/gpt-6.1-sol", "anthropic/claude-opus-5.5", "google/gemini-4-argon", "deepseek/deepseek-v4-pro"] },
  huge: { id: "perf-huge", title: "Stress: one 400 KB answer", models: ["anthropic/claude-sonnet-5.5"] },
  chats: 1000,
} as const;

const SMALL_MODELS = ["google/gemma-4-31b:free", "openai/gpt-6-astra", "anthropic/claude-sonnet-5.5", "deepseek/deepseek-v4-flash", "qwen/qwen3.8-max", "google/gemini-4-argon", "openai/gpt-6.1-sol", "mistral/leanstral-1.5:free"];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number) {
  let c = 0xffffffff;
  for (let index = start; index < end; index += 1) c = crcTable[(c ^ bytes[index]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An uncompressed (stored-deflate) RGB PNG, so each image is a realistic ~200 KB to encode and send. */
export function stripedPng(width: number, height: number, seed: number) {
  const r = random(seed);
  const [red, green, blue] = [r.int(40, 220), r.int(40, 220), r.int(40, 220)];
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const shade = ((x >> 4) + (y >> 4)) % 2 ? 30 : 0;
      raw[row + 1 + x * 3] = (red + shade + (x & 15)) & 0xff;
      raw[row + 2 + x * 3] = (green + shade + (y & 15)) & 0xff;
      raw[row + 3 + x * 3] = (blue + shade) & 0xff;
    }
  }
  const blocks = Math.ceil(raw.length / 65535);
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78; zlib[1] = 0x01;
  let offset = 2;
  for (let block = 0; block < blocks; block += 1) {
    const start = block * 65535;
    const length = Math.min(65535, raw.length - start);
    zlib[offset] = block === blocks - 1 ? 1 : 0;
    zlib[offset + 1] = length & 0xff; zlib[offset + 2] = length >> 8;
    zlib[offset + 3] = ~length & 0xff; zlib[offset + 4] = (~length >> 8) & 0xff;
    zlib.set(raw.subarray(start, start + length), offset + 5);
    offset += 5 + length;
  }
  let a = 1, b = 0;
  for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  zlib[offset] = b >> 8; zlib[offset + 1] = b & 0xff; zlib[offset + 2] = a >> 8; zlib[offset + 3] = a & 0xff;
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width); headerView.setUint32(4, height);
  header[8] = 8; header[9] = 2;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib), chunk("IEND", new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { png.set(part, at); at += part.length; }
  return png;
}

type Row = { id: string; chatId: string; role: "user" | "assistant"; model: string | null; parentId: string | null; content: string; reasoning: string; attachments: string; usage: string | null; createdAt: number; position: number };

export function seedStressData(database: SQLiteDatabase, log: (event: string, data: Record<string, unknown>) => void) {
  const started = performance.now();
  const r = random(20261019);
  const now = Date.now();
  const imageDir = new Directory(Paths.document, "chat-attachments");
  if (!imageDir.exists) imageDir.create({ intermediates: true });
  const image = (key: string, index: number) => {
    const file = new File(imageDir, `perf-${key}-${index}.png`);
    if (!file.exists) file.writeSync(stripedPng(320, 220, index + 1));
    return { id: `perf-image-${key}-${index}`, kind: "image", name: `photo-${index + 1}.png`, mimeType: "image/png", uri: file.uri, size: file.size };
  };
  const searchColumns = database.getAllSync<{ name: string }>("PRAGMA table_info(chat_search)").map((column) => column.name);
  const searchHasMessage = searchColumns.includes("message_id");

  const insertChat = database.prepareSync("INSERT INTO chats (id, title, models, model_settings, pinned, workspace_id, preview, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, NULL, '', ?, ?)");
  const setPreview = database.prepareSync("UPDATE chats SET preview = ? WHERE id = ?");
  const insertMessage = database.prepareSync("INSERT INTO messages (id, chat_id, role, model, parent_id, content, reasoning, status, error, attachments, usage, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, 'done', NULL, ?, ?, ?, ?)");
  const insertSearch = database.prepareSync(searchHasMessage ? "INSERT INTO chat_search (chat_id, message_id, body) VALUES (?, ?, ?)" : "INSERT INTO chat_search (chat_id, body) VALUES (?, ?)");
  let messages = 0;
  let bytes = 0;
  const put = (row: Row) => {
    insertMessage.executeSync(row.id, row.chatId, row.role, row.model, row.parentId, row.content, row.reasoning, row.attachments, row.usage, row.createdAt, row.position);
    if (row.content) insertSearch.executeSync(...(searchHasMessage ? [row.chatId, row.id, row.content] : [row.chatId, row.content]));
    messages += 1;
    bytes += row.content.length + row.reasoning.length;
  };

  /** A chat of `turns` turns; every model answers each question. Returns its preview. */
  const chat = (spec: { id: string; title: string; models: readonly string[]; turns: number; pinned?: boolean; updatedAt: number; images?: (turn: number) => boolean; answerFor?: (r: Random, turn: number, model: string) => string }) => {
    let position = 0;
    let promptTokens = 400;
    let preview = "";
    const start = spec.updatedAt - spec.turns * 90_000;
    insertChat.executeSync(spec.id, spec.title, JSON.stringify(spec.models), spec.pinned ? 1 : 0, start, spec.updatedAt);
    for (let turn = 0; turn < spec.turns; turn += 1) {
      const userId = `${spec.id}-u${turn}`;
      const text = question(r);
      preview = text.slice(0, 140);
      const attachments = spec.images?.(turn) ? JSON.stringify([image(spec.id, turn)]) : "[]";
      const at = start + turn * 90_000;
      put({ id: userId, chatId: spec.id, role: "user", model: null, parentId: null, content: text, reasoning: "", attachments, usage: null, createdAt: at, position: position++ });
      promptTokens += Math.ceil(text.length / 4);
      for (const model of spec.models) {
        const content = spec.answerFor?.(r, turn, model) ?? answer(r);
        const thought = r.chance(0.2) ? reasoning(r) : "";
        const outputTokens = Math.ceil((content.length + thought.length) / 4);
        put({ id: `${spec.id}-a${turn}-${spec.models.indexOf(model)}`, chatId: spec.id, role: "assistant", model, parentId: userId, content, reasoning: thought, attachments: "[]", usage: JSON.stringify({ inputTokens: promptTokens, outputTokens, costUsd: model.endsWith(":free") ? 0 : Number((promptTokens * 2e-6 + outputTokens * 1e-5).toFixed(6)) }), createdAt: at + 20_000, position: position++ });
        if (model === spec.models[0]) promptTokens += Math.ceil(content.length / 4);
      }
    }
    setPreview.executeSync(preview, spec.id);
  };

  try {
    database.withTransactionSync(() => {
      chat({ ...STRESS.long, updatedAt: now - 60_000, images: (turn) => turn > 0 && turn % 150 === 0 });
      chat({ ...STRESS.multi, updatedAt: now - 120_000, images: (turn) => turn % 100 === 7 });
      chat({ ...STRESS.huge, turns: 3, updatedAt: now - 180_000, answerFor: (random, turn) => (turn === 1 ? hugeAnswer(random) : answer(random)) });
      for (let index = 0; index < STRESS.chats - 3; index += 1) {
        const models = r.chance(0.15) ? [r.pick(SMALL_MODELS), r.pick(SMALL_MODELS)].filter((model, at, all) => all.indexOf(model) === at) : [r.pick(SMALL_MODELS)];
        chat({ id: `perf-chat-${index}`, title: `${question(r).split("?")[0]!.slice(0, 56)}`, models, turns: r.int(1, 6), pinned: index < 3, updatedAt: now - 300_000 - index * r.int(3, 12) * 3_600_000, images: (turn) => index % 40 === 0 && turn === 0 });
      }
    });
  } finally {
    insertChat.finalizeSync();
    setPreview.finalizeSync();
    insertMessage.finalizeSync();
    insertSearch.finalizeSync();
  }
  log("seed.done", { ms: Math.round(performance.now() - started), chats: STRESS.chats, messages, mb: Number((bytes / 1024 / 1024).toFixed(1)) });
}

export function clearChats(database: SQLiteDatabase) {
  database.withTransactionSync(() => {
    database.runSync("DELETE FROM chat_search");
    database.runSync("DELETE FROM messages");
    database.runSync("DELETE FROM chats");
  });
  const dir = new Directory(Paths.document, "chat-attachments");
  if (dir.exists) for (const entry of dir.list()) if (entry.name.startsWith("perf-")) entry.delete();
  database.execSync("VACUUM");
}
