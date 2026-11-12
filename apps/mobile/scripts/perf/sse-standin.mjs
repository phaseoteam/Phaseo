#!/usr/bin/env node
// A local stand-in for phaseo.app's web chat proxy (POST /api/chat/chat-completions), for load tests of the
// "Phaseo Perf" build. It streams chat-completions SSE (reasoning deltas, content deltas one token at a time,
// a usage chunk, [DONE]) at a set rate, and answers compaction requests with a short summary.
//
//   node scripts/perf/sse-standin.mjs [--port 8787] [--rate 300] [--bytes 60000] [--reasoning 2000] [--log file]
//   curl -X POST localhost:8787/__config -d '{"rate":50,"bytes":400000,"failSummary":false}'
//
// Never point it at, or run it against, production.
import { Buffer } from "node:buffer";
import fs from "node:fs";
import http from "node:http";
import { answer, random } from "../../src/perf/corpus.ts";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const config = {
  port: Number(args.port ?? 8787),
  rate: Number(args.rate ?? 300),
  bytes: Number(args.bytes ?? 60_000),
  reasoning: Number(args.reasoning ?? 2000),
  failSummary: false,
  summaryDelayMs: 1500,
  contextError: false,
};
const logFile = args.log;
const requests = [];
let counter = 0;

const record = (entry) => {
  requests.push(entry);
  const line = JSON.stringify(entry);
  console.log(line);
  if (logFile) fs.appendFileSync(logFile, `${line}\n`);
};

function text(content) {
  if (typeof content === "string") return content;
  return (content ?? []).map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

/** About `bytes` of Markdown, split into ~4-character tokens. */
function tokens(bytes, seed) {
  const r = random(seed);
  let body = "";
  while (body.length < bytes) body += `${answer(r)}\n\n`;
  body = body.slice(0, bytes);
  return body.match(/[\s\S]{1,4}/g) ?? [];
}

function packet(delta, extra = {}) {
  return `data: ${JSON.stringify({ id: "chatcmpl-perf", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "perf", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;
}

async function stream(res, { reasoningTokens, contentTokens, promptTokens, closed }) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(packet({ role: "assistant", content: "" }));
  const tickMs = 20;
  const perTick = Math.max(1, Math.round((config.rate * tickMs) / 1000));
  const all = [...reasoningTokens.map((token) => ({ reasoning: token })), ...contentTokens.map((token) => ({ content: token }))];
  for (let index = 0; index < all.length && !closed(); index += perTick) {
    res.write(all.slice(index, index + perTick).map((delta) => packet(delta)).join(""));
    await new Promise((resolve) => setTimeout(resolve, tickMs));
  }
  if (closed()) return;
  const completion = Math.ceil(all.length);
  res.write(`data: ${JSON.stringify({ id: "chatcmpl-perf", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: "chatcmpl-perf", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completion, total_tokens: promptTokens + completion, cost: 0 } })}\n\n`);
  res.end("data: [DONE]\n\n");
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks);
    if (req.method === "POST" && req.url === "/__config") {
      Object.assign(config, JSON.parse(raw.toString("utf8") || "{}"));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(config));
      return;
    }
    if (req.method === "GET" && req.url === "/__stats") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ config, requests }));
      return;
    }
    if (req.method !== "POST" || !req.url?.startsWith("/api/chat/chat-completions")) {
      res.writeHead(404).end();
      return;
    }
    let closedEarly = false;
    res.on("close", () => { closedEarly = !res.writableEnded; });
    const received = Date.now();
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400).end(JSON.stringify({ error: "invalid_json" })); return; }
    const messages = body?.requestBody?.messages ?? [];
    const chars = messages.reduce((sum, message) => sum + text(message.content).length, 0);
    const images = messages.reduce((sum, message) => sum + (Array.isArray(message.content) ? message.content.filter((part) => part.type === "image_url").length : 0), 0);
    const summary = messages.some((message) => message.role === "system" && /compact|summar/i.test(text(message.content))) && /Write the summary now\.?\s*$/.test(text(messages.at(-1)?.content));
    const hasSummary = messages.some((message) => text(message.content).includes("<conversation_summary>"));
    counter += 1;
    const entry = { n: counter, at: new Date(received).toISOString(), kind: summary ? "summary" : "answer", model: body?.requestBody?.model, kb: Math.round(raw.length / 1024), messages: messages.length, chars, images, hasSummary, maxTokens: body?.requestBody?.max_tokens ?? null };
    const promptTokens = Math.ceil(chars / 4);
    if (summary) {
      if (config.failSummary) {
        record({ ...entry, status: 503 });
        res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "upstream_error", message: "The stand-in refused the summary (failSummary)." } }));
        return;
      }
      // /__config sets the delay; anything outside 0–60 s falls back to the default.
      let delayMs = 1500;
      const requested = Number(config.summaryDelayMs);
      if (requested >= 0 && requested <= 60_000) delayMs = requested;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const summaryText = `## Summary so far\n\n- The user has asked ${messages.length} questions about databases, lists and streaming.\n- Key decisions: keep pages small, batch writes, measure before and after.\n- Open thread: the last question, which the assistant should answer next.\n\n(Stand-in summary of ${chars.toLocaleString("en-GB")} characters.)`;
      record({ ...entry, status: 200 });
      await stream(res, { reasoningTokens: [], contentTokens: summaryText.match(/[\s\S]{1,4}/g), promptTokens, closed: () => closedEarly });
      return;
    }
    if (config.contextError) {
      record({ ...entry, status: 400 });
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "context_length_exceeded", message: "This model's maximum context length was exceeded." } }));
      return;
    }
    record({ ...entry, status: 200 });
    await stream(res, { reasoningTokens: tokens(config.reasoning, counter * 7 + 1), contentTokens: tokens(config.bytes, counter * 7 + 3), promptTokens, closed: () => closedEarly });
  });
});

server.listen(config.port, "0.0.0.0", () => console.log(JSON.stringify({ standIn: `http://0.0.0.0:${config.port}`, config })));
