import { describe, expect, it } from "vitest";
import { AudioSpeechSchema } from "./schemas";

describe("AudioSpeechSchema", () => {
    it("rejects stream_format for audio.speech", () => {
        const result = AudioSpeechSchema.safeParse({
            model: "openai/gpt-4o-mini-tts",
            input: "hello",
            stream_format: "sse",
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((issue) => issue.path.join(".") === "stream_format")).toBe(true);
    });
});
