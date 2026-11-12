import type { OpenCodeClient } from "@opencode/client";
// Native commands can complete without an execution event. Reconcile durable text
// before closing SSE so a slower event connection cannot drop the final answer.
export class OpenCodeCommandOutput {
 private baseline?: string;
 private readonly streamed = new Map<string, string>();
 private readonly finalized = new Set<string>();
 constructor(private readonly client: OpenCodeClient, private readonly sessionID: string, private readonly signal: AbortSignal, private readonly delta: (id: string, text: string) => void) {}
 async start() { const page = await this.client.message.list({ sessionID: this.sessionID, type: "assistant", order: "desc", limit: 1 }, { signal: this.signal }); this.baseline = page.data[0]?.id; }
 stream(id: string, text: string) { if (this.finalized.has(id)) return; const previous = this.streamed.get(id) ?? ""; if (previous.length + text.length > 1000000) throw new Error("Native command output exceeds the text limit."); this.streamed.set(id, previous + text); this.delta(id, text); }
 async finish() {
  const messages: Awaited<ReturnType<OpenCodeClient["message"]["list"]>>["data"] = []; let cursor: string | undefined; let complete = false; const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
   const page = await this.client.message.list({ sessionID: this.sessionID, type: "assistant", limit: 200, ...(cursor ? { cursor } : { order: "desc" as const }) }, { signal: this.signal });
   const boundary = this.baseline ? page.data.findIndex(message => message.id === this.baseline) : -1;
   messages.push(...(boundary >= 0 ? page.data.slice(0, boundary) : page.data));
   if (boundary >= 0 || (!this.baseline && page.data.length < 200)) { complete = true; break; }
   const next = page.cursor?.next; if (!next || !page.data.length || seen.has(next)) break; seen.add(next); cursor = next;
  }
  if (!complete) throw new Error("Native command output could not be fully reconciled.");
  let size = 0;
  for (const message of messages.reverse()) {
   if (message.type !== "assistant") throw new Error("Native command returned an invalid assistant record.");
   const text = message.content.filter(part => part.type === "text").map(part => part.text).join(""); size += text.length;
   if (size > 1000000) throw new Error("Native command output exceeds the text limit.");
   const previous = this.streamed.get(message.id) ?? "";
   if (!text.startsWith(previous)) throw new Error("Native command stream differs from its saved output.");
   this.finalized.add(message.id); if (text.length > previous.length) this.delta(message.id, text.slice(previous.length));
   if (message.error || message.finish === "error") throw new Error("Native command execution failed.");
  }
 }
}
