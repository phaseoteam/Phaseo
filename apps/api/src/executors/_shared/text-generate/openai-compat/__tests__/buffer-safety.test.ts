import { describe, expect, it } from "vitest";
import { bufferStreamToIR } from "../index";
const args = { requestId: "request", providerId: "test", ir: { model: "test", messages: [], stream: false } } as any;
const chat = { id: "chat", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hello 🌍" }, finish_reason: "stop" }] };
const frame = (payload: unknown, ending = "\n") => `data: ${JSON.stringify(payload)}${ending}${ending}`;
const buffer = (body: string, route: "chat" | "responses" = "chat", source?: "gateway" | "byok") => bufferStreamToIR(new Response(body), args, route, Date.now(), undefined, source);

describe("bounded nonstream materialization", () => {
    it.each(["\n", "\r", "\r\n"])("keeps Chat usage after finish_reason with %j framing", async ending => {
        const result = await buffer(frame(chat, ending) + frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }, ending) + `data: [DONE]${ending}${ending}`);
        expect(result.ir.choices[0].message.content).toEqual([{ type: "text", text: "Hello 🌍" }]);
        expect(result.usage.total_tokens).toBe(14);
    });
    it("accepts native Responses incomplete terminal but never just response.created", async () => {
        const response = { id: "response", object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], usage: { input_tokens: 3, output_tokens: 2 } };
        const result = await buffer(`event: response.incomplete\ndata: ${JSON.stringify({ response })}\n\n`, "responses");
        expect(result.rawResponse.status).toBe("incomplete");
        await expect(buffer(frame({ type: "response.created", response: { ...response, status: "in_progress" } }), "responses")).rejects.toMatchObject({ code: "sse_missing_terminal" });
    });
    it("accepts fully framed late tool identity with DONE without losing arguments", async () => {
        const chunk = (tool: unknown, finish_reason: string | null) => ({ ...chat, choices: [{ index: 0, delta: { tool_calls: [tool] }, finish_reason }] });
        const result = await buffer(frame(chunk({ index: 0, function: { name: "lookup", arguments: '{"city":"London"}' } }, null))
            + frame(chunk({ index: 0, id: "call_late" }, "tool_calls")) + "data: [DONE]\n\n");
        expect(result.ir.choices[0].message.toolCalls).toEqual([{ id: "call_late", type: "function", name: "lookup", arguments: '{"city":"London"}' }]);
    });
    it("rejects bare or unframed terminal markers and malformed JSON", async () => {
        for (const body of ["data: [DONE]", frame(chat), frame(chat) + "data: [DONE]", "data: nope\n\n", "data: null\n\n"]) {
            await expect(buffer(body)).rejects.toThrow(/^sse_/);
        }
    });
    it("keeps ordinary JSON fallback including text/plain", async () => {
        const complete = { ...chat, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "json" }, finish_reason: "stop" }] };
        expect((await buffer(JSON.stringify(complete))).ir.choices[0].message.content).toEqual([{ type: "text", text: "json" }]);
    });
    it("rejects provider errors with correct ownership before materializing", async () => {
        const error = { type: "error", error: { type: "authentication_error", message: "not retained" } };
        for (const source of ["gateway", "byok"] as const) for (const body of [frame(error), JSON.stringify(error)]) {
            await expect(buffer(body, "responses", source)).rejects.toMatchObject({ status: 401, healthImpact: source === "byok" ? "neutral" : "failure" });
        }
    });
    it("bounds aggregate output and sparse choice/tool indices", async () => {
        const large = frame({ ...chat, choices: [{ index: 0, delta: { content: "x".repeat(1024 * 1024) } }] });
        let chunks = 0;
        const growing = new ReadableStream<Uint8Array>({ pull(controller) {
            if (chunks++ < 17) controller.enqueue(new TextEncoder().encode(large)); else controller.close();
        } });
        await expect(bufferStreamToIR(new Response(growing), args, "chat", Date.now())).rejects.toMatchObject({ code: "sse_state_too_large" });
        for (const index of [-1, 128, 0.5, "__proto__"]) {
            await expect(buffer(frame({ ...chat, choices: [{ index, delta: {} }] }) + "data: [DONE]\n\n")).rejects.toMatchObject({ code: "sse_state_too_large" });
            await expect(buffer(frame({ ...chat, choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: "{}" } }] } }] }) + "data: [DONE]\n\n")).rejects.toMatchObject({ code: "sse_state_too_large" });
        }
    });
});
