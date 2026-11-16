import { describe, expect, it, vi } from "vitest";
import { estimateAudioDurationSeconds, estimateOpenAiSpeechToTextUsage, mergeSpeechToTextUsage } from "./audio-transcription-usage";

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

    // 60 s of 16 kHz mono 16-bit PCM: 32,000 bytes per second.
    const wavBytes = (seconds: number) => {
        const dataSize = seconds * 32_000;
        const bytes = new Uint8Array(44 + dataSize);
        const view = new DataView(bytes.buffer);
        bytes.set([0x52, 0x49, 0x46, 0x46], 0);
        view.setUint32(4, 36 + dataSize, true);
        bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16_000, true);
        view.setUint32(28, 32_000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        bytes.set([0x64, 0x61, 0x74, 0x61], 36);
        view.setUint32(40, dataSize, true);
        return bytes;
    };

    it("measures a WAV from its header, whatever type the upload declares", async () => {
        expect(await estimateAudioDurationSeconds(new File([wavBytes(60)], "a.wav", { type: "audio/wav" }))).toBe(60);
        expect(await estimateAudioDurationSeconds(new File([wavBytes(60)], "a.bin", { type: "application/octet-stream" }))).toBe(60);
    });

    it("estimates from the file size when a file declared as WAV has no WAV header", async () => {
        // 16 kB/s for the .mp3 filename.
        const named = new File([new Uint8Array(16_000 * 90)], "lecture.mp3", { type: "audio/wav" });
        expect(await estimateAudioDurationSeconds(named)).toBe(90);
        const usage = await estimateOpenAiSpeechToTextUsage({ file: named, text: "transcript" });
        expect(usage).toMatchObject({ input_audio_seconds: 90, input_audio_tokens: 3_600 });

        // No known format in the type or the filename: the default rate, 24 kB/s.
        const unnamed = new File([new Uint8Array(24_000 * 90)], "lecture.wav", { type: "audio/wav" });
        expect(await estimateAudioDurationSeconds(unnamed)).toBe(90);
    });

    it("estimates an unrecognised type from the filename, else at the default rate", async () => {
        const bytes = new Uint8Array(48_000 * 10);
        expect(await estimateAudioDurationSeconds(new File([bytes], "a.flac", { type: "application/octet-stream" }))).toBe(20);
        expect(await estimateAudioDurationSeconds(new File([bytes], "a.bin", { type: "application/octet-stream" }))).toBe(20);
        expect(await estimateAudioDurationSeconds(new Blob([bytes]))).toBe(20);
    });

    it("counts the bytes present when a WAV header declares far less data than follows", async () => {
        const bytes = wavBytes(60);
        new DataView(bytes.buffer).setUint32(40, 2, true);
        const file = new File([bytes], "a.wav", { type: "audio/wav" });
        expect(await estimateAudioDurationSeconds(file)).toBe(60);
        expect((await estimateOpenAiSpeechToTextUsage({ file })).input_audio_tokens).toBe(2_400);
    });

    it("keeps the declared WAV data size when other chunks follow it", async () => {
        // 10 s of audio followed by a metadata chunk as large as 50 s of audio.
        const bytes = wavBytes(60);
        const view = new DataView(bytes.buffer);
        const listOffset = 44 + 10 * 32_000;
        view.setUint32(40, 10 * 32_000, true);
        bytes.set([0x4c, 0x49, 0x53, 0x54], listOffset);
        view.setUint32(listOffset + 4, bytes.length - listOffset - 8, true);
        expect(await estimateAudioDurationSeconds(new File([bytes], "a.wav", { type: "audio/wav" }))).toBe(10);
    });

    it("never counts a non-empty file as no audio", async () => {
        const usage = await estimateOpenAiSpeechToTextUsage({
            file: new File([new Uint8Array([1, 2, 3, 4])], "sample.bin", { type: "application/octet-stream" }),
            text: "ok",
        });
        expect(usage.input_audio_seconds).toBe(0.001);
        expect(usage.input_audio_tokens).toBe(1);
    });

    it("logs a warning when duration fallback cannot infer audio length", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const file = new File([], "sample.bin", {
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
