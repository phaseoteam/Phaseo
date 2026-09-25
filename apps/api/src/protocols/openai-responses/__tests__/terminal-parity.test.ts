import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { transformChatStreamToResponses } from "@executors/_shared/text-generate/openai-compat/stream-transforms";
import { readSseEvents } from "@core/sse";
import { encodeOpenAIResponsesResponse } from "../encode";
import { enrichSuccessPayload } from "@/pipeline/after/payload";
import type { PipelineContext } from "@/pipeline/before/types";
import type { RequestResult } from "@/pipeline/execute";

describe("buffered and streaming Responses terminal parity", () => {
    it.each([
        ["length", "incomplete", "max_output_tokens"],
        ["content_filter", "incomplete", "content_filter"],
        ["stop", "completed", undefined],
        ["tool_calls", "completed", undefined],
        ["error", "failed", undefined],
    ] as const)("preserves %s terminal semantics", async (finishReason, status, reason) => {
        const ir: IRChatResponse = { id: "fixture", model: "test", choices: [{ index: 0,
            message: { role: "assistant", content: [{ type: "text", text: "partial" }] }, finishReason }],
            usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 } };
        const buffered = encodeOpenAIResponsesResponse(ir);
        const ctx = { endpoint: "responses", requestId: "fixture", model: "test", body: {}, meta: {} } as PipelineContext;
        const enriched = await enrichSuccessPayload(ctx, { provider: "poolside", ir, normalized: buffered,
            rawResponse: { choices: [{ finish_reason: finishReason }] } } as unknown as RequestResult);
        const args = { providerId: "poolside", requestId: "fixture", ir: { model: "test", messages: [] } } as unknown as ExecutorExecuteArgs;
        const wire = `data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { content: "partial" }, finish_reason: finishReason }],
            usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } })}\n\ndata: [DONE]\n\n`;
        const stream = transformChatStreamToResponses(new Response(wire).body!, args,
            { requestId: "fixture", providerId: "poolside", choiceStates: new Map() });
        const terminals = [];
        for await (const event of readSseEvents(stream)) {
            const payload = JSON.parse(event.data);
            if (["response.completed", "response.incomplete", "response.failed"].includes(payload.type)) terminals.push(payload);
        }
        expect(terminals).toHaveLength(1);
        expect(buffered.status).toBe(status);
        expect(enriched.status).toBe(status);
        expect(enriched.incomplete_details).toEqual(reason ? { reason } : null);
        expect(terminals[0].response.status).toBe(status);
        expect(buffered.incomplete_details).toEqual(reason ? { reason } : undefined);
        expect(terminals[0].response.incomplete_details).toEqual(buffered.incomplete_details);
        expect(buffered.usage).toMatchObject({ input_tokens: 7, output_tokens: 2, total_tokens: 9 });
        expect(terminals[0].response.usage).toEqual(JSON.parse(JSON.stringify(buffered.usage)));
        expect(JSON.stringify(buffered.output)).toContain("partial");
    });

    it("preserves authoritative native details rather than replacing them with inferred IR reasons", async () => {
        const ctx = { endpoint: "responses", requestId: "fixture", model: "test", body: {}, meta: {} } as PipelineContext;
        const result = { provider: "fixture", rawResponse: { status: "incomplete",
            incomplete_details: { reason: "content_filter" } }, ir: { choices: [{
                message: { role: "assistant", content: [] }, finishReason: "length" }] } } as unknown as RequestResult;
        expect((await enrichSuccessPayload(ctx, result)).incomplete_details).toEqual({ reason: "content_filter" });
        result.rawResponse = { status: "completed" };
        expect((await enrichSuccessPayload(ctx, result)).incomplete_details).toBeNull();
    });
});
