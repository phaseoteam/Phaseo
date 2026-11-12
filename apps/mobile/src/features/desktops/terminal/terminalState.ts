import { phoneLimits, type PhoneCapability, type PhoneTerminal } from "../protocol";

type Connection = { status: string; protocol?: number; capabilities?: readonly PhoneCapability[] };
/** Terminals show while the computer speaks protocol 7 and lets this phone read code and use terminals. */
export const usesTerminals = (state: Connection) => state.status === "connected" && (state.protocol ?? 0) >= 7
  && Boolean(state.capabilities?.includes("code")) && Boolean(state.capabilities?.includes("terminal"));

export const terminalStatus = (terminal: Pick<PhoneTerminal, "status" | "exitCode">) =>
  terminal.status === "running" ? "Running" : terminal.status === "interrupted" ? "Stopped when the app closed" : `Exited${terminal.exitCode !== undefined ? ` with ${terminal.exitCode}` : ""}`;

export type Modifier = "ctrl" | "alt";
/** The key bar, left to right; Ctrl and Alt apply to the next key typed. */
export const keyBar: readonly ({ key: string; label: string; data: string } | { key: Modifier; label: string; modifier: Modifier })[] = [
  { key: "esc", label: "Esc", data: "\u001b" },
  { key: "tab", label: "Tab", data: "\t" },
  { key: "ctrl", label: "Ctrl", modifier: "ctrl" },
  { key: "alt", label: "Alt", modifier: "alt" },
  { key: "left", label: "←", data: "\u001b[D" },
  { key: "up", label: "↑", data: "\u001b[A" },
  { key: "down", label: "↓", data: "\u001b[B" },
  { key: "right", label: "→", data: "\u001b[C" },
];

/** What a key sends with Ctrl or Alt held: Ctrl+C is 0x03, Alt+x is Esc then x, and an arrow takes xterm's modifier code. */
export function withModifier(data: string, modifier: Modifier) {
  const arrow = /^\u001b\[([ABCD])$/.exec(data);
  if (arrow) return `\u001b[1;${modifier === "ctrl" ? 5 : 3}${arrow[1]}`;
  if (modifier === "alt") return `\u001b${data}`;
  const first = data[0];
  if (!first) return data;
  const lower = first.toLowerCase();
  if (lower >= "a" && lower <= "z") return String.fromCharCode(lower.charCodeAt(0) - 96) + data.slice(1);
  const symbols: Record<string, string> = { "@": "\u0000", " ": "\u0000", "[": "\u001b", "\\": "\u001c", "]": "\u001d", "^": "\u001e", _: "\u001f", "?": "\u007f" };
  return symbols[first] !== undefined ? symbols[first] + data.slice(1) : data;
}

/**
 * Pasted text as a shell should get it: control characters that could act as keys become spaces, and line breaks
 * become Enter (CR), which is what a terminal's Enter sends.
 */
export const pasteData = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\r\n|\n/g, "\r");

/** Input in pieces of at most phoneLimits.terminalInputChars, never splitting an emoji. */
export function inputChunks(data: string, size: number = phoneLimits.terminalInputChars) {
  const chunks: string[] = [];
  for (let start = 0; start < data.length;) {
    let end = Math.min(start + size, data.length);
    if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1]!)) end -= 1;
    chunks.push(data.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Terminal output for a thread's message, as the window's "Add to chat" writes it. */
export function terminalContext(title: string, selection: string) {
  const text = selection.replace(/\s+$/g, "").replace(/^\n+/, "");
  const fence = text.includes("```") ? "````" : "```";
  return `Output from ${title}:\n${fence}text\n${text}\n${fence}`;
}

/** Adds a block to a draft, on its own paragraph. */
export const appendBlock = (draft: string, block: string) => (draft.trim() ? `${draft.replace(/\s+$/, "")}\n\n${block}` : block);

/** The lines from one tapped line to another, whichever was tapped first. */
export function selectedLines(lines: readonly string[], from: number, to: number) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return lines.slice(start, end + 1).join("\n");
}

/**
 * The terminal page and its output, held until the page in view has loaded xterm. A page that goes away or starts
 * loading again has lost what it was given, so output waits again until that page says it's ready.
 */
export function pageOutput() {
  let page: { injectJavaScript(code: string): void } | null = null, ready = false, queued: string[] = [];
  const run = (code: string) => page?.injectJavaScript(`${code};true;`);
  return {
    run,
    get ready() { return ready; },
    page(handle: typeof page) { page = handle; if (!handle) ready = false; },
    write(data: string) { if (!data) return; if (ready) run(`window.phaseoTerminal.write(${JSON.stringify(data)})`); else queued.push(data); },
    reset() { queued = []; if (ready) run("window.phaseoTerminal.reset()"); },
    loaded() {
      ready = true;
      const waiting = queued.join(""); queued = [];
      if (waiting) run(`window.phaseoTerminal.write(${JSON.stringify(waiting)})`);
    },
    unloaded() { ready = false; },
  };
}
