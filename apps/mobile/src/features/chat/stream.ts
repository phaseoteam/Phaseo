/**
 * Decodes one streamed OpenAI-compatible chat completion.
 * Ported from apps/desktop/src/main/chatCompletionStream.ts (desktop 38f2abce11);
 * Chat on mobile has no tools, and reasoning deltas are kept for the "Thinking" view.
 */
export class StreamError extends Error {
  constructor(message: string, public code: string, public retryable: boolean) {
    super(message);
  }
}

export type StreamUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number; [key: string]: unknown };

type Packet = {
  error?: unknown;
  usage?: StreamUsage;
  choices?: { index?: number; delta?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
};

const errorText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : value && typeof value === "object" ? errorText((value as Record<string, unknown>).message) ?? errorText((value as Record<string, unknown>).error) : undefined;

export type StreamHandlers = { onText(text: string): void; onReasoning?(text: string): void };

export async function readChatCompletion(body: ReadableStream<Uint8Array>, handlers: StreamHandlers, idleMs = 120_000): Promise<{ text: string; reasoning: string; usage?: StreamUsage }> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let text = "";
  let reasoning = "";
  let finished = false;
  let usage: StreamUsage | undefined;
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; void reader.cancel().catch(() => undefined); }, idleMs);
  };

  const consume = (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data === "[DONE]") { finished = true; return; }
    let packet: Packet;
    try { packet = JSON.parse(data) as Packet; } catch { return; }
    if (packet.error) throw new StreamError(errorText(packet.error) ?? "The model reported an error partway through the answer.", "stream_error", true);
    if (packet.usage && typeof packet.usage === "object") usage = packet.usage;
    for (const choice of packet.choices ?? []) {
      if (choice.index !== undefined && choice.index !== 0) continue;
      const thought = choice.delta?.reasoning ?? choice.delta?.reasoning_content;
      if (typeof thought === "string" && thought) { reasoning += thought; handlers.onReasoning?.(thought); }
      if (typeof choice.delta?.content === "string" && choice.delta.content) { text += choice.delta.content; handlers.onText(choice.delta.content); }
      if (choice.finish_reason === "length") throw new StreamError("The answer reached the model's output limit before it finished.", "max_output_tokens", false);
      if (choice.finish_reason === "content_filter") throw new StreamError("The provider's content filter stopped the answer.", "content_filter", false);
      if (choice.finish_reason) finished = true;
    }
  };

  try {
    arm();
    while (true) {
      const { done, value } = await reader.read().catch((error: unknown) => {
        throw error instanceof TypeError ? new StreamError("The connection dropped before the answer finished.", "stream_dropped", true) : error;
      });
      arm();
      if (stalled) throw new StreamError(`The model sent nothing for ${Math.round(idleMs / 1000)} seconds.`, "stream_idle", true);
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 8 * 1024 * 1024) throw new StreamError("The answer stream was too large.", "stream_too_large", false);
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
    if (!finished && !text) throw new StreamError("The answer ended before it started.", "stream_truncated", true);
    return { text, reasoning, usage };
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
  }
}
