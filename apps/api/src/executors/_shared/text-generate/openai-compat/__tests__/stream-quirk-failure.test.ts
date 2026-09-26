import { expect, it, vi } from "vitest";
vi.mock("../quirks", () => ({ getProviderQuirks: () => ({ transformStreamChunk: () => { throw new Error("private credentials"); } }) }));
import { transformChatStream } from "../stream-transforms";
import { GatewayStreamError } from "@core/stream-error";

it("does not swallow adapter transformation errors or misattribute them to upstream", async () => {
    const source = new Response('data: {"object":"chat.completion.chunk","choices":[]}\n\ndata: [DONE]\n\n');
    const stream = transformChatStream(source.body!, { providerId: "test" } as any, { requestId: "test", providerId: "test", choiceStates: new Map() });
    let error: unknown;
    try { await new Response(stream).text(); } catch (failure) { error = failure; }
    expect(error).toBeInstanceOf(GatewayStreamError);
    expect(error).toMatchObject({ origin: "gateway", kind: "transform", healthImpact: "neutral", code: "gateway_stream_transform_failed" });
    expect(String(error)).not.toContain("private credentials");
    expect(source.body!.locked).toBe(false);
});
