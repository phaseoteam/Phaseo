import { AgentStreamError } from "@phaseo/agent-sdk";

type ChatToolCall = { id: string; name: string; input: Record<string, unknown>; inputError?: string };
const errorText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : value && typeof value === "object" ? errorText((value as Record<string, unknown>).message) ?? errorText((value as Record<string, unknown>).error) : undefined;

/** Decode one compatible streamed completion, including fragmented tool arguments. A stream that sends nothing for idleMs is abandoned. */
export async function readChatCompletion(response: Response, onText: (text: string) => void, idleMs?: number): Promise<{ text: string; calls: ChatToolCall[]; usage?: Record<string, unknown> }> {
 if (!response.body) throw new Error("The provider returned no response stream.");
 const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
 const calls = new Map<number, { id: string; name: string; arguments: string }>();
 let buffer = "", finished = false, text = "", toolBytes = 0, usage: Record<string, unknown> | undefined;
 const consume = (block: string) => {
  const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  if (!data) return;
  if (data === "[DONE]") { finished = true; return; }
  const packet = JSON.parse(data) as { error?: unknown; usage?: Record<string, unknown>; choices?: { index?: number; delta?: { content?: string; tool_calls?: { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[] };
  if (packet.error) throw new AgentStreamError(errorText(packet.error) ?? "The model provider reported an error partway through the response.", { code: "stream_error", retryable: true });
  if (packet.usage && typeof packet.usage === "object") usage = packet.usage;
  if (finished && packet.choices?.length) throw new Error("The provider sent completion data after finishing.");
  for (const choice of packet.choices ?? []) {
   if (choice.index !== undefined && choice.index !== 0) throw new Error("Multiple completion choices are unsupported.");
   if (typeof choice.delta?.content === "string") { text += choice.delta.content; onText(choice.delta.content); }
   for (const delta of choice.delta?.tool_calls ?? []) {
    if (!Number.isInteger(delta.index) || delta.index! < 0 || delta.index! >= 32 || (delta.type !== undefined && delta.type !== "function")) throw new Error("Invalid streamed tool call.");
    const call = calls.get(delta.index!) ?? { id: "", name: "", arguments: "" };
    if (delta.id !== undefined) { if (typeof delta.id !== "string" || (call.id && call.id !== delta.id)) throw new Error("Streamed tool identity changed."); call.id = delta.id; }
    if (delta.function?.name !== undefined) { if (typeof delta.function.name !== "string") throw new Error("Invalid tool name."); call.name += delta.function.name; }
    if (delta.function?.arguments !== undefined) { if (typeof delta.function.arguments !== "string") throw new Error("Invalid tool arguments."); call.arguments += delta.function.arguments; toolBytes += Buffer.byteLength(delta.function.arguments); }
    if (call.id.length > 200 || call.name.length > 200 || Buffer.byteLength(call.arguments) > 100 * 1024 || toolBytes > 1024 * 1024) throw new Error("Streamed tool calls exceed the size limit.");
    calls.set(delta.index!, call);
   }
   if (choice.finish_reason === "length") throw new AgentStreamError("The answer reached the model's output limit before it finished.", { code: "max_output_tokens", retryable: false });
   if (choice.finish_reason === "content_filter") throw new AgentStreamError("The model provider stopped the answer with its content filter.", { code: "content_filter", retryable: false });
   if (choice.finish_reason) finished = true;
  }
 };
 let stalled = false, timer: ReturnType<typeof setTimeout> | undefined;
 const arm = () => { if (!idleMs) return; clearTimeout(timer); timer = setTimeout(() => { stalled = true; void reader.cancel().catch(() => {}); }, idleMs); };
 try {
  arm();
  while (true) {
   // fetch reports a connection closed partway through as a bare TypeError ("terminated").
   const { done, value } = await reader.read().catch((error: unknown) => { throw error instanceof TypeError ? new AgentStreamError("The connection to the model provider dropped before the response finished.", { code: "stream_dropped", retryable: true, cause: error }) : error; }); arm();
   if (stalled) throw new AgentStreamError(`The model sent nothing for ${Math.round(idleMs! / 1000)} seconds.`, { code: "stream_idle", retryable: true });
   buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
   if (buffer.length > 8 * 1024 * 1024) throw new Error("The provider stream exceeded the packet size limit.");
   let match: RegExpExecArray | null;
   while ((match = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length); }
   if (done) { if (buffer.trim()) consume(buffer); break; }
  }
  if (!finished) throw new AgentStreamError("The model's response ended before it finished.", { code: "stream_truncated", retryable: true });
  const identities = new Set<string>();
  return { text, usage, calls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
   if (!call.id || !call.name || identities.has(call.id)) throw new Error("Invalid or duplicated tool identity."); identities.add(call.id);
   // Arguments the model got wrong go back to it as an error on that call, rather than failing the step.
   let input: unknown;
   try { input = JSON.parse(call.arguments || "{}"); } catch (error) { return { id: call.id, name: call.name, input: {}, inputError: error instanceof Error ? error.message : "invalid JSON" }; }
   if (!input || typeof input !== "object" || Array.isArray(input)) return { id: call.id, name: call.name, input: {}, inputError: "the arguments must be a JSON object" };
   return { id: call.id, name: call.name, input: input as Record<string, unknown> };
  }) };
 } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
