import { describe, expect, it } from "vitest";
import { resolveTextExecutionStream } from "../textStreaming";

const enabled = { supported: true, bufferedParity: true, preferStreamingForBufferedRequests: true };
describe("buffered upstream streaming capability", () => {
    it.each([undefined, null, [], ["stream"], {}, { stream: true }, { stream: {} }, { stream: [] },
        { stream: { supported: true } }, { stream: { ...enabled, bufferedParity: "true" } }])(
        "keeps native buffered transport for unknown or malformed metadata: %j", metadata => {
            expect(resolveTextExecutionStream(false, metadata)).toBe(false);
        });
    it.each(Object.keys(enabled))("requires an explicit true value for %s", key => {
        expect(resolveTextExecutionStream(false, { stream: { ...enabled, [key]: false } })).toBe(false);
    });
    it("opts in only with the complete trusted declaration", () => {
        expect(resolveTextExecutionStream(false, { stream: enabled })).toBe(true);
    });
    it.each([undefined, { stream: { supported: false } }, { stream: enabled }])(
        "does not downgrade client streaming: %j", metadata => {
            expect(resolveTextExecutionStream(true, metadata)).toBe(true);
        });
});
