#!/usr/bin/env node
// Load-test scenarios for the "Phaseo Perf" build (app.phaseo.client.perf), run over adb. The same method
// runs before and after a change; every result is appended as one JSON line to --out.
//
//   ANDROID_SERIAL=emulator-5554 node scripts/perf/measure.mjs <scenario> [--label before-emulator] [--out results.jsonl]
//
// Scenarios: seed, db, coldlist, listscroll, open <chatId>, scrolltop <chatId>, stream <chatId>, mem, search <text>
// Timings come from the app's `[PhaseoPerf]` logcat lines (src/perf/tools.ts); frame stats from
// `dumpsys gfxinfo`, memory from `dumpsys meminfo`. Only ever touches the perf package.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PKG = "app.phaseo.client.perf";
const SCHEME = "phaseo-perf";
const adbPath = `${process.env.ANDROID_HOME}/platform-tools/adb`;
const serial = process.env.ANDROID_SERIAL;
if (!serial) throw new Error("Set ANDROID_SERIAL.");

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.flatMap((value, index) => (value.startsWith("--") ? [[value.slice(2), argv[index + 1]]] : [])));
const positional = argv.filter((value, index) => !value.startsWith("--") && !(index > 0 && argv[index - 1].startsWith("--")));
const [scenario, target] = positional;
const label = flags.label ?? "run";
const out = flags.out;
const runs = Number(flags.runs ?? 3);

const adb = (...args) => execFileSync(adbPath, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const shell = (...args) => adb("shell", ...args);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const median = (values) => { const sorted = values.filter((value) => value != null).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

function emit(result) {
  const line = JSON.stringify({ label, serial, scenario, at: new Date().toISOString(), ...result });
  console.log(line);
  if (out) fs.appendFileSync(out, `${line}\n`);
}

function link(path) {
  shell("am", "start", "-a", "android.intent.action.VIEW", "-d", `'${SCHEME}://perf/${path}'`, PKG);
}

/** `[PhaseoPerf]` lines since the last clear, with the device's log time. */
function perfLines() {
  const text = adb("logcat", "-d", "-v", "epoch", "ReactNativeJS:I", "*:S");
  return text.split(/\r?\n/).flatMap((line) => {
    const at = line.indexOf("[PhaseoPerf] ");
    if (at < 0) return [];
    try { return [{ logTime: Number(line.trim().split(/\s+/)[0]) * 1000, ...JSON.parse(line.slice(at + 13)) }]; } catch { return []; }
  });
}

function waitFor(event, timeoutMs = 60_000, where = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = perfLines().find((line) => line.event === event && where(line));
    if (found) return found;
    sleep(400);
  }
  return null;
}

function gfxReset() { shell("dumpsys", "gfxinfo", PKG, "reset"); }
function gfx() {
  const text = shell("dumpsys", "gfxinfo", PKG);
  const number = (pattern) => { const match = pattern.exec(text); return match ? Number(match[1]) : null; };
  return {
    frames: number(/Total frames rendered: (\d+)/),
    janky: number(/Janky frames: (\d+)/),
    jankyPct: number(/Janky frames: \d+ \(([\d.]+)%\)/),
    p50: number(/50th percentile: (\d+)ms/),
    p90: number(/90th percentile: (\d+)ms/),
    p95: number(/95th percentile: (\d+)ms/),
    p99: number(/99th percentile: (\d+)ms/),
    slowUi: number(/Number Slow UI thread: (\d+)/),
    deadlineMissed: number(/Number Frame deadline missed: (\d+)/),
  };
}

function pssMb() {
  const match = /TOTAL PSS:\s+(\d+)/.exec(shell("dumpsys", "meminfo", PKG)) ?? /TOTAL\s+(\d+)/.exec(shell("dumpsys", "meminfo", PKG));
  return match ? Math.round(Number(match[1]) / 1024) : null;
}

const size = () => { const match = /(\d+)x(\d+)/.exec(shell("wm", "size").split("\n").filter(Boolean).at(-1)); return { width: Number(match[1]), height: Number(match[2]) }; };
function swipe(direction, durationMs = 60) {
  const { width, height } = size();
  const x = Math.round(width / 2);
  const [from, to] = direction === "down" ? [0.3, 0.8] : [0.8, 0.3];
  shell("input", "swipe", String(x), String(Math.round(height * from)), String(x), String(Math.round(height * to)), String(durationMs));
}

function toList() {
  link("list");
  sleep(1500);
}

function open(chatId, timeoutMs = 90_000) {
  adb("logcat", "-c");
  link(`open?chat=${chatId}`);
  const first = waitFor("chat.firstContent", timeoutMs, (line) => line.chatId === chatId);
  const interactive = waitFor("chat.interactive", timeoutMs, (line) => line.chatId === chatId);
  return { firstContentMs: first?.ms ?? null, interactiveMs: interactive?.ms ?? null, first, migrate: perfLines().find((line) => line.event === "db.migrate") ?? null };
}

switch (scenario) {
  case "seed": {
    adb("logcat", "-c");
    link("seed");
    const done = waitFor("seed.done", 600_000);
    const db = waitFor("db", 120_000);
    emit({ seed: done, db });
    break;
  }
  case "db": {
    adb("logcat", "-c");
    link("db");
    emit({ db: waitFor("db", 60_000) });
    break;
  }
  case "coldlist": {
    const samples = [];
    for (let run = 0; run < runs; run += 1) {
      shell("am", "force-stop", PKG);
      sleep(1500);
      adb("logcat", "-c");
      const launch = shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `'${SCHEME}://perf/list'`, PKG);
      const totalTime = Number(/TotalTime: (\d+)/.exec(launch)?.[1] ?? NaN);
      const loaded = waitFor("chatlist.load", 60_000);
      const start = adb("logcat", "-d", "-v", "epoch", "-b", "all").split(/\r?\n/).find((line) => line.includes("Start proc") && line.includes(PKG));
      const procAt = start ? Number(start.trim().split(/\s+/)[0]) * 1000 : null;
      samples.push({ totalTime, listRenderMs: loaded?.ms ?? null, rows: loaded?.rows ?? null, coldToListMs: loaded && procAt ? Math.round(loaded.logTime - procAt) : null, migrate: perfLines().find((line) => line.event === "db.migrate")?.ms ?? null });
      sleep(2000);
    }
    emit({ samples, medianColdToListMs: median(samples.map((sample) => sample.coldToListMs)), medianListRenderMs: median(samples.map((sample) => sample.listRenderMs)), medianLaunchMs: median(samples.map((sample) => sample.totalTime)) });
    break;
  }
  case "listscroll": {
    toList();
    sleep(2000);
    gfxReset();
    const started = Date.now();
    for (let index = 0; index < 30; index += 1) { swipe("up", 50); sleep(250); }
    for (let index = 0; index < 10; index += 1) { swipe("down", 50); sleep(250); }
    sleep(1000);
    emit({ seconds: (Date.now() - started) / 1000, gfx: gfx() });
    break;
  }
  case "open": {
    const samples = [];
    for (let run = 0; run < runs; run += 1) {
      toList();
      sleep(2500);
      const result = open(target);
      sleep(3000);
      samples.push({ ...result, pssMb: pssMb() });
    }
    toList();
    emit({ chatId: target, samples: samples.map(({ first, ...rest }) => ({ ...rest, firstData: first })), medianFirstContentMs: median(samples.map((sample) => sample.firstContentMs)), medianInteractiveMs: median(samples.map((sample) => sample.interactiveMs)), medianPssMb: median(samples.map((sample) => sample.pssMb)) });
    break;
  }
  case "scrolltop": {
    toList();
    sleep(2000);
    const opened = open(target);
    sleep(3000);
    gfxReset();
    adb("logcat", "-c");
    link("mark?name=scroll.start");
    sleep(300);
    const started = Date.now();
    const limitMs = Number(flags.limit ?? 300_000);
    let swipes = 0;
    let top = null;
    while (Date.now() - started < limitMs) {
      swipe("down", 40);
      swipes += 1;
      sleep(250);
      if (swipes % 8 === 0 && (top = perfLines().find((line) => line.event === "chat.top"))) break;
    }
    top ??= perfLines().find((line) => line.event === "chat.top") ?? null;
    const frames = gfx();
    const pss = pssMb();
    toList();
    emit({ chatId: target, opened: { firstContentMs: opened.firstContentMs, interactiveMs: opened.interactiveMs }, reachedTop: Boolean(top), topMs: top?.ms ?? null, wallSeconds: (Date.now() - started) / 1000, swipes, gfx: frames, pssMbAtTop: pss });
    break;
  }
  case "stream": {
    // Needs the stand-in running and the app pointed at it (perf/origin?url=…).
    toList();
    sleep(2000);
    open(target);
    sleep(3000);
    adb("logcat", "-c");
    link("counts?label=reset");
    link("wal-start");
    link("lag-start");
    sleep(500);
    gfxReset();
    const ui = (...args) => execFileSync("node", [flags.ui ?? "E:/phaseo-worktrees/demo-tools/mobile-test/ui.mjs", ...args], { encoding: "utf8", env: { ...process.env, ANDROID_SERIAL: serial } });
    ui("type", "Message", "Explain the trade-offs again in detail");
    sleep(300);
    ui("tap", "Send");
    const started = Date.now();
    // While it streams: type in the composer and nudge the list, as a reader would.
    let typed = 0;
    let done = [];
    const answers = Number(flags.answers ?? 1);
    while (Date.now() - started < Number(flags.limit ?? 600_000)) {
      sleep(2500);
      if ((done = perfLines().filter((line) => line.event === "stream.done")).length >= answers) break;
      shell("input", "text", "abc");
      typed += 3;
      if (typed % 9 === 0) { swipe("down", 120); sleep(400); swipe("up", 120); }
    }
    const frames = gfx();
    link("lag-stop?label=stream");
    link("counts?label=stream");
    link("wal-stop?label=stream");
    sleep(1500);
    const lines = perfLines();
    for (let index = 0; index < typed; index += 1) shell("input", "keyevent", "67");
    emit({ chatId: target, wallSeconds: (Date.now() - started) / 1000, gfx: frames, stream: done, wal: lines.find((line) => line.event === "wal")?.walKb ?? null, lag: lines.find((line) => line.event === "lag"), counts: lines.find((line) => line.event === "counts" && line.label === "stream"), history: lines.filter((line) => line.event === "history.build"), request: lines.filter((line) => line.event === "request.body"), compaction: lines.filter((line) => line.event?.startsWith("compaction")) });
    toList();
    break;
  }
  case "mem": {
    emit({ pssMb: pssMb() });
    break;
  }
  default:
    throw new Error(`Unknown scenario ${scenario}`);
}
