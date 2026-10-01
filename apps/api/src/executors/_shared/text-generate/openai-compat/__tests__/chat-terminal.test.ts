import { describe, expect, it } from "vitest";
import { transformChatStream } from "../stream-transforms";
import type { ExecutorExecuteArgs } from "@executors/types";

const args = { providerId: "poolside", requestId: "req-terminal" } as ExecutorExecuteArgs;
const state = () => ({ requestId: args.requestId, providerId: args.providerId, choiceStates: new Map() });
const terminal = 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n';

describe("Chat terminal marker preservation", () => {
    it("preserves the upstream DONE marker exactly once after terminal usage", async () => {
        const source = `${terminal}data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n`;
        const text = await new Response(transformChatStream(new Response(source).body!, args, state())).text();
        expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
        expect(text.indexOf('"usage"')).toBeLessThan(text.indexOf("[DONE]"));
    });
    it("does not duplicate DONE or forward data after the terminal marker", async () => {
        const source = `${terminal}data: [DONE]\n\ndata: [DONE]\n\ndata: {"late":true}\n\n`;
        const text = await new Response(transformChatStream(new Response(source).body!, args, state())).text();
        expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
        expect(text).not.toContain("late");
    });
    it("preserves a DONE frame split at every byte boundary", async () => {
        const bytes = new TextEncoder().encode(`${terminal}data: [DONE]\n\n`);
        for (let boundary = 1; boundary < bytes.length; boundary++) {
            const source = new ReadableStream<Uint8Array>({ start(controller) {
                controller.enqueue(bytes.slice(0, boundary)); controller.enqueue(bytes.slice(boundary)); controller.close();
            } });
            const text = await new Response(transformChatStream(source, args, state())).text();
            expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
        }
    });
    it("does not manufacture a terminal marker from EOF or an incomplete frame", async () => {
        for (const source of [terminal, `${terminal}data: [DO`]) {
            const text = await new Response(transformChatStream(new Response(source).body!, args, state())).text();
            expect(text).not.toContain("[DONE]");
        }
    });
});
