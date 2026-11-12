import { describe, expect, it, vi } from "vitest";
import { estimateOpenAiSpeechToTextUsage, mergeSpeechToTextUsage } from "./audio-transcription-usage";

describe("mergeSpeechToTextUsage", () => {
    // A 320 kB MP3 is estimated at 20 s (16 kB/s), i.e. 800 audio tokens.
    const estimate = async (prompt?: string) => estimateOpenAiSpeechToTextUsage({
        file: new File([new Uint8Array(320_000)], "voice-note.mp3", { type: "audio/mpeg" }),
        prompt,
        text: "SIM-TRANSCRIPT-0001 the forecast is clear",
    });

    it("bills gpt-4o-transcribe from the reported audio, prompt and output tokens", async () => {
        const usage = mergeSpeechToTextUsage({
            type: "tokens",
            input_tokens: 1_531,
            input_token_details: { text_tokens: 20, audio_tokens: 1_511 },
            output_tokens: 87,
            total_tokens: 1_618,
        }, await estimate("SIM prompt that the estimate would count"));

        expect(usage).toMatchObject({
            input_audio_tokens: 1_511,
            input_text_tokens: 20,
            output_text_tokens: 87,
            inputTokens: 1_531,
            outputTokens: 87,
            totalTokens: 1_618,
        });
    });

    it("treats a reported text_tokens of 0 as reported, not as missing", async () => {
        const usage = mergeSpeechToTextUsage({
            type: "tokens",
            input_tokens: 1_511,
            input_token_details: { text_tokens: 0, audio_tokens: 1_511 },
            output_tokens: 87,
        }, await estimate("a prompt the provider did not count"));

        expect(usage.input_text_tokens).toBe(0);
        expect(usage.input_audio_tokens).toBe(1_511);
    });

    it("derives whisper-1 audio tokens from the reported seconds, not the file size", async () => {
        const usage = mergeSpeechToTextUsage({ type: "duration", seconds: 62, input_audio_seconds: 62 }, await estimate());

        expect(usage).toMatchObject({ input_audio_seconds: 62, input_audio_tokens: 2_480, inputTokens: 2_480 });
    });

    it("keeps meters an adapter already set", async () => {
        const usage = mergeSpeechToTextUsage({ input_audio_tokens: 300, output_text_tokens: 9 }, await estimate());

        expect(usage).toMatchObject({ input_audio_tokens: 300, output_text_tokens: 9 });
    });

    it("falls back to the estimate only when nothing is reported", async () => {
        const estimated = await estimate();
        const usage = mergeSpeechToTextUsage(undefined, estimated);

        expect(usage).toMatchObject({ input_audio_seconds: 20, input_audio_tokens: 800, output_text_tokens: estimated.output_text_tokens });
    });
});

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

	 it("uses a compressed-audio filename when multipart MIME metadata is empty", async () => {
		 const file = new File([new Uint8Array(16000 * 2)], "sample.mp3", { type: "" });
		 const usage = await estimateOpenAiSpeechToTextUsage({ file, text: "transcript" });
		 expect(usage.input_audio_seconds).toBe(2);
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
