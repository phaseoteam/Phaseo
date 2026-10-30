import { describe, expect, it, vi } from "vitest";
import { readChatCompletion } from "./chatCompletionStream";
const packet = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (tool: unknown) => packet({ choices: [{ index: 0, delta: { tool_calls: [tool] } }] });
describe("compatible Chat completion streams", () => {
 it("assembles UTF-8 and interleaved fragmented tool calls while preserving text", async () => {
  const source = packet({ choices: [{ delta: { content: "Hello 🦊" } }] }) + delta({ index: 1, id: "load", type: "function", function: { name: "load_", arguments: '{"id":"' } }) + delta({ index: 0, id: "list", function: { name: "list_skills", arguments: "{}" } }) + delta({ index: 1, function: { name: "skill", arguments: 'global:review"}' } }) + packet({ choices: [{ finish_reason: "tool_calls" }] }) + packet({ choices: [], usage: { total_tokens: 1 } }) + "data: [DONE]\n\n";
  const body = new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(source)) controller.enqueue(new Uint8Array([byte])); controller.close(); } }); const onText = vi.fn();
  expect(await readChatCompletion(new Response(body), onText)).toEqual({ text: "Hello 🦊", usage: { total_tokens: 1 }, calls: [{ id: "list", name: "list_skills", input: {} }, { id: "load", name: "load_skill", input: { id: "global:review" } }] }); expect(onText).toHaveBeenCalledExactlyOnceWith("Hello 🦊");
 });
 it.each([
  delta({ index: 32, id: "bad" }),
  delta({ index: 0, id: "first", function: { name: "load_skill", arguments: "{}" } }) + delta({ index: 0, id: "changed" }),
  delta({ index: 0, id: "same", function: { name: "list_skills", arguments: "{}" } }) + delta({ index: 1, id: "same", function: { name: "list_skills", arguments: "{}" } }),
  delta({ index: 0, id: "bad", function: { name: "load_skill", arguments: "x".repeat(100 * 1024 + 1) } }),
 ])("rejects invalid calls before returning them: %#", async source => { await expect(readChatCompletion(new Response(source + "data: [DONE]\n\n"), () => {})).rejects.toThrow(); });
 it.each([["[]", "JSON object"], ["{", "JSON"]])("returns unreadable arguments %s as a call the model can correct", async (args, error) => {
  const result = await readChatCompletion(new Response(delta({ index: 0, id: "bad", function: { name: "load_skill", arguments: args } }) + "data: [DONE]\n\n"), () => {});
  expect(result.calls).toEqual([{ id: "bad", name: "load_skill", input: {}, inputError: expect.stringContaining(error) }]);
 });
 it("abandons a stream that goes quiet", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(packet({ choices: [{ delta: { content: "Thinking" } }] }))); } });
  await expect(readChatCompletion(new Response(body), () => {}, 30)).rejects.toMatchObject({ code: "stream_idle", retryable: true });
 });
 it("rejects truncated and invalid UTF-8 streams", async () => {
  await expect(readChatCompletion(new Response(delta({ index: 0, id: "load", function: { name: "load_skill", arguments: "{}" } })), () => {})).rejects.toMatchObject({ code: "stream_truncated", retryable: true });
  await expect(readChatCompletion(new Response(new Uint8Array([0xff])), () => {})).rejects.toThrow();
 });
 it.each([["length", "max_output_tokens"], ["content_filter", "content_filter"]])("rejects an incomplete %s finish as final", async (finish_reason, code) => { await expect(readChatCompletion(new Response(packet({ choices: [{ finish_reason }] }) + "data: [DONE]\n\n"), () => {})).rejects.toMatchObject({ code, retryable: false }); });
 it("reports gateway errors partway through with their message", async () => { await expect(readChatCompletion(new Response(packet({ error: { message: "Upstream reset the connection" } })), () => {})).rejects.toMatchObject({ message: "Upstream reset the connection", retryable: true }); });
});
