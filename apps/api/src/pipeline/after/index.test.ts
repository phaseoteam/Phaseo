import { describe, expect, it } from "vitest";
import { shouldReturnBinaryAudio } from "./index";

function makeContext(overrides: Record<string, any> = {}) {
    return {
        endpoint: "audio.speech",
        body: {},
        meta: {},
        ...overrides,
    } as any;
}

describe("shouldReturnBinaryAudio", () => {
    it("defaults audio.speech to binary when no explicit format is requested", () => {
        expect(shouldReturnBinaryAudio(makeContext())).toBe(true);
    });

    it("returns JSON when stream_format=json is requested", () => {
        expect(shouldReturnBinaryAudio(makeContext({ body: { stream_format: "json" } }))).toBe(false);
    });

    it("returns JSON when the client explicitly asks for application/json", () => {
        expect(shouldReturnBinaryAudio(makeContext({ meta: { accept: "application/json" } }))).toBe(false);
    });

    it("still returns binary when the client explicitly accepts audio", () => {
        expect(shouldReturnBinaryAudio(makeContext({ meta: { accept: "audio/wav" } }))).toBe(true);
    });

    it("does not force binary for non-audio endpoints", () => {
        expect(shouldReturnBinaryAudio(makeContext({ endpoint: "responses" }))).toBe(false);
    });
});
