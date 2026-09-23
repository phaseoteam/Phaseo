import { describe, expect, it } from "vitest";
import { GatewayStreamError, classifyStreamException, classifyStreamProviderError } from "./stream-error";
import { SseProtocolError } from "./sse";

describe("stream error classification", () => {
    it.each([401, 402, 403, 429])("keeps BYOK %s neutral even for midstream errors", status => {
        expect(classifyStreamProviderError({ error: { status } }, "byok").healthImpact).toBe("neutral");
        expect(classifyStreamProviderError({ error: { status } }, "gateway").healthImpact).toBe("failure");
    });
    it("preserves already classified gateway faults across adapter reads", () => {
        const error = new GatewayStreamError("gateway", "transform", "gateway_stream_transform_failed");
        expect(classifyStreamException(error, "provider")).toBe(error);
        expect(error).toMatchObject({ healthImpact: "neutral", retryable: false });
        expect(Object.isFrozen(error)).toBe(true);
    });
    it("does not retain or disclose raw exception secrets", () => {
        const raw = new Error("Bearer SECRET with customer data");
        const error = classifyStreamException(raw, "provider");
        expect(error).toMatchObject({ kind: "transport", retryable: true, healthImpact: "failure" });
        expect(JSON.stringify(error)).not.toContain("SECRET"); expect(error.message).not.toContain("SECRET");
        expect(error.cause).toBeUndefined();
    });
    it("classifies protocol corruption separately from gateway capacity limits", () => {
        expect(classifyStreamException(new SseProtocolError("sse_invalid_json"), "provider"))
            .toMatchObject({ origin: "provider", kind: "protocol", retryable: false, healthImpact: "failure" });
        expect(classifyStreamException(new SseProtocolError("sse_state_too_large"), "provider"))
            .toMatchObject({ origin: "gateway", retryable: false, healthImpact: "neutral" });
    });
    it.each(["permission_error", "rate_limit_error", "authentication_error"])("maps native %s ownership", code => {
        expect(classifyStreamProviderError({ type: "error", error: { type: code } }, "byok").healthImpact).toBe("neutral");
    });
    it("handles response-wrapped errors and rejects arbitrary unsafe codes", () => {
        expect(classifyStreamProviderError({ response: { error: { code: "overloaded_error" } } }))
            .toMatchObject({ status: 529, retryable: true, healthImpact: "failure" });
        expect(classifyStreamProviderError({ error: { code: "secret\nvalue", message: "secret" } }).code).toBe("upstream_stream_failure");
        expect(classifyStreamProviderError({ error: { code: "__proto__" } }).status).toBeUndefined();
    });
});
