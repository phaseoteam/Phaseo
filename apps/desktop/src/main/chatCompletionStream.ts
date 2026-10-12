type ChatToolCall = { id: string; name: string; input: Record<string, unknown> };
/** Decode one compatible streamed completion, including fragmented tool arguments. */
export async function readChatCompletion(response: Response, onText: (text: string) => void): Promise<{ text: string; calls: ChatToolCall[] }> {
 if (!response.body) throw new Error("The provider returned no response stream.");
 const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
 const calls = new Map<number, { id: string; name: string; arguments: string }>();
 let buffer = "", finished = false, text = "", toolBytes = 0;
 const consume = (block: string) => {
  const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  if (!data) return;
  if (data === "[DONE]") { finished = true; return; }
  const packet = JSON.parse(data) as { error?: unknown; choices?: { index?: number; delta?: { content?: string; tool_calls?: { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[] };
  if (packet.error) throw new Error("The model provider reported an inference error.");
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
   if (choice.finish_reason) { if (["length", "content_filter"].includes(choice.finish_reason)) throw new Error("The provider did not complete the response."); finished = true; }
  }
 };
 try {
  while (true) {
   const { done, value } = await reader.read(); buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
   if (buffer.length > 8 * 1024 * 1024) throw new Error("The provider stream exceeded the packet size limit.");
   let match: RegExpExecArray | null;
   while ((match = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length); }
   if (done) { if (buffer.trim()) consume(buffer); break; }
  }
  if (!finished) throw new Error("The provider stream ended before completion.");
  const identities = new Set<string>();
  return { text, calls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
   if (!call.id || !call.name || identities.has(call.id)) throw new Error("Invalid or duplicated tool identity."); identities.add(call.id);
   const input: unknown = JSON.parse(call.arguments);
   if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool arguments must be a JSON object.");
   return { id: call.id, name: call.name, input: input as Record<string, unknown> };
  }) };
 } finally { await reader.cancel(); reader.releaseLock(); }
}
