import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import type { ExecutorExecuteArgs } from "@executors/types";

const args = { providerId: "poolside", requestId: "req-terminal", ir: { model: "test", stream: true, messages: [] },
    endpoint: "responses", protocol: "openai.responses" } as unknown as ExecutorExecuteArgs;

function upstream(finish: string) {
    return new Response(`data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk", model: "test",
        choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: finish }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })}\n\ndata: [DONE]\n\n`);
}
function frames(text: string) {
    return text.trim().split("\n\n").map(frame => ({
        event: frame.split("\n").find(line => line.startsWith("event:"))?.slice(7),
        payload: JSON.parse(frame.split("\n").find(line => line.startsWith("data:"))!.slice(6)),
    }));
}

describe("Translated Responses event contract", () => {
    it.each([
        ["stop", "completed"], ["tool_calls", "completed"], ["length", "incomplete"],
        ["content_filter", "incomplete"], ["error", "failed"],
    ])("maps %s to one %s terminal with matching event/type", async (finish, status) => {
        const output = frames(await new Response(resolveStreamForProtocol(upstream(finish), args, "chat")).text());
        for (const [index, frame] of output.entries()) {
            expect(frame.payload.type).toBe(frame.event);
            expect(frame.payload.sequence_number).toBe(index);
        }
        const terminal = output.filter(frame => ["response.completed", "response.incomplete", "response.failed"].includes(frame.event!));
        expect(terminal).toHaveLength(1);
        expect(terminal[0].event).toBe(`response.${status}`);
        expect(terminal[0].payload.response.status).toBe(status);
        expect(terminal[0].payload.response.usage.output_tokens).toBe(1);
        if (finish === "length") expect(terminal[0].payload.response.incomplete_details.reason).toBe("max_output_tokens");
    });
    it("preserves max-token usage and stop reason through the Messages bridge", async () => {
        const output = frames(await new Response(resolveStreamForProtocol(upstream("length"), {
            ...args, endpoint: "messages", protocol: "anthropic.messages",
        } as ExecutorExecuteArgs, "chat")).text());
        expect(output.filter(frame => frame.event === "message_stop")).toHaveLength(1);
        const delta = output.find(frame => frame.event === "message_delta")!;
        expect(delta.payload.delta.stop_reason).toBe("max_tokens");
        expect(delta.payload.usage.output_tokens).toBe(1);
    });
    it("translates failed completion to a Messages error instead of a successful message_stop", async () => {
        const output = frames(await new Response(resolveStreamForProtocol(upstream("error"), {
            ...args, endpoint: "messages", protocol: "anthropic.messages",
        } as ExecutorExecuteArgs, "chat")).text());
        expect(output.filter(frame => frame.event === "error")).toHaveLength(1);
        expect(output.some(frame => frame.event === "message_stop")).toBe(false);
    });
});
