import { describe, expect, it, vi } from "vitest";
import { estimateOpenAiSpeechToTextUsage } from "./audio-transcription-usage";

describe("estimateOpenAiSpeechToTextUsage", () => {
    it("falls back to a coarse duration estimate for mp3 uploads", async () => {
        const file = new File([new Uint8Array(16000 * 3)], "sample.mp3", {
            type: "audio/mpeg",
        });

        const usage = await estimateOpenAiSpeechToTextUsage({
            file,
            text: "transcript",
        });

        expect(usage.input_audio_seconds).toBe(3);
        expect(usage.input_audio_tokens).toBe(120);
        expect(usage.output_text_tokens).toBeGreaterThan(0);
    });

    it("logs a warning when duration fallback cannot infer audio length", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const file = new File([new Uint8Array([1, 2, 3, 4])], "sample.bin", {
            type: "application/octet-stream",
        });

        const usage = await estimateOpenAiSpeechToTextUsage({
            file,
            text: "ok",
        });

        expect(usage.input_audio_tokens).toBe(0);
        expect(warnSpy).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });
});
