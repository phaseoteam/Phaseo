import { describe, expect, it, vi } from "vitest";
import { readChatCompletion } from "./chatCompletionStream";
const packet = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (tool: unknown) => packet({ choices: [{ index: 0, delta: { tool_calls: [tool] } }] });
describe("compatible Chat completion streams", () => {
 it("assembles UTF-8 and interleaved fragmented tool calls while preserving text", async () => {
  const source = packet({ choices: [{ delta: { content: "Hello 🦊" } }] }) + delta({ index: 1, id: "load", type: "function", function: { name: "load_", arguments: '{"id":"' } }) + delta({ index: 0, id: "list", function: { name: "list_skills", arguments: "{}" } }) + delta({ index: 1, function: { name: "skill", arguments: 'global:review"}' } }) + packet({ choices: [{ finish_reason: "tool_calls" }] }) + packet({ choices: [], usage: { total_tokens: 1 } }) + "data: [DONE]\n\n";
  const body = new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(source)) controller.enqueue(new Uint8Array([byte])); controller.close(); } }); const onText = vi.fn();
  expect(await readChatCompletion(new Response(body), onText)).toEqual({ text: "Hello 🦊", calls: [{ id: "list", name: "list_skills", input: {} }, { id: "load", name: "load_skill", input: { id: "global:review" } }] }); expect(onText).toHaveBeenCalledExactlyOnceWith("Hello 🦊");
 });
 it.each([
  delta({ index: 32, id: "bad" }),
  delta({ index: 0, id: "first", function: { name: "load_skill", arguments: "{}" } }) + delta({ index: 0, id: "changed" }),
  delta({ index: 0, id: "same", function: { name: "list_skills", arguments: "{}" } }) + delta({ index: 1, id: "same", function: { name: "list_skills", arguments: "{}" } }),
  delta({ index: 0, id: "bad", function: { name: "load_skill", arguments: "[]" } }),
  delta({ index: 0, id: "bad", function: { name: "load_skill", arguments: "{" } }),
  delta({ index: 0, id: "bad", function: { name: "load_skill", arguments: "x".repeat(100 * 1024 + 1) } }),
 ])("rejects invalid calls before returning them: %#", async source => { await expect(readChatCompletion(new Response(source + "data: [DONE]\n\n"), () => {})).rejects.toThrow(); });
 it("rejects truncated and invalid UTF-8 streams", async () => {
  await expect(readChatCompletion(new Response(delta({ index: 0, id: "load", function: { name: "load_skill", arguments: "{}" } })), () => {})).rejects.toThrow("before completion");
  await expect(readChatCompletion(new Response(new Uint8Array([0xff])), () => {})).rejects.toThrow();
 });
 it.each(["length", "content_filter"])("rejects an incomplete %s finish", async finish_reason => { await expect(readChatCompletion(new Response(packet({ choices: [{ finish_reason }] }) + "data: [DONE]\n\n"), () => {})).rejects.toThrow("did not complete"); });
});
