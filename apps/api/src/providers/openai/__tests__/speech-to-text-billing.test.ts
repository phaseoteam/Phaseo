import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execTranscription } from "../endpoints/audio-transcription";
import { exec as execTranslation } from "../endpoints/audio-translation";
import { calculatePricing } from "@pipeline/after/pricing";

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

/** A silent 16-bit mono 8 kHz WAV of the given length. */
function wav(seconds: number): File {
	const dataSize = Math.round(seconds * 8000) * 2;
	const bytes = new Uint8Array(44 + dataSize);
	const view = new DataView(bytes.buffer);
	const ascii = (offset: number, text: string) => [...text].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
	ascii(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); ascii(8, "WAVE");
	ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
	view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
	ascii(36, "data"); view.setUint32(40, dataSize, true);
	return new File([bytes], "clip.wav", { type: "audio/wav" });
}

const rule = (meter: string, unit: string, unitSize: number, price: string) => ({
	meter, unit, unit_size: unitSize, price_per_unit: price, currency: "USD",
	pricing_plan: "standard", note: null, match: [], priority: 100,
});
const card = (provider: string, model: string, endpoint: string, rules: any[]) => ({
	provider, model, endpoint, effective_from: null, effective_to: null, currency: "USD", version: null, rules,
}) as any;

// Production cards (2026-10-21).
const TOGETHER_CARD = (endpoint: string) => card("together", "openai/whisper-large-v3", endpoint, [rule("input_audio_minutes", "minute", 1, "0.0015")]);
const GROQ_CARD = card("groq", "openai/whisper-large-v3", "audio.transcription", [rule("input_audio_seconds", "second", 3600, "0.111")]);

function args(providerId: string, endpoint: string, body: Record<string, unknown>) {
	return {
		endpoint, model: "openai/whisper-large-v3", body: { model: "openai/whisper-large-v3", ...body },
		meta: { requestId: "req_stt_billing", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
		workspaceId: "team_test", providerId, byokMeta: [], pricingCard: null,
		providerModelSlug: providerId === "together" ? "openai/whisper-large-v3" : "whisper-large-v3", stream: false,
	} as any;
}

async function run(
	exec: typeof execTranscription,
	providerId: string,
	endpoint: string,
	path: string,
	body: Record<string, unknown>,
	response: Record<string, unknown>,
) {
	const mock = installFetchMock([{ match: (url) => url.endsWith(path), response: jsonResponse(response) }]);
	try {
		return await exec(args(providerId, endpoint, body));
	} finally {
		mock.restore();
	}
}

describe("Together Whisper billing per audio minute", () => {
	it("bills a json transcription from the measured audio length", async () => {
		const result = await run(execTranscription, "together", "audio.transcription", "/audio/transcriptions",
			{ file: wav(90), response_format: "json" }, { text: "hello" });
		expect(result.bill.usage).toMatchObject({ input_audio_seconds: 90, input_audio_minutes: 1.5 });
		// Before: no input_audio_minutes, so $0.
		expect(calculatePricing(result.bill.usage, TOGETHER_CARD("audio.transcription"), {}).totalNanos).toBe(2_250_000);
	});

	it("bills a verbose_json translation from Together's reported duration", async () => {
		const result = await run(execTranslation, "together", "audio.translations", "/audio/translations",
			{ file: wav(30), response_format: "verbose_json" },
			{ task: "translate", language: "french", duration: 120, text: "hello", segments: [] });
		expect(result.bill.usage).toMatchObject({ input_audio_seconds: 120, input_audio_minutes: 2 });
		// Before: $0 (and the 30 s file estimate rather than the reported 120 s).
		expect(calculatePricing(result.bill.usage, TOGETHER_CARD("audio.translations"), {}).totalNanos).toBe(3_000_000);
	});
});

describe("Groq Whisper 10-second minimum", () => {
	const tenSeconds = calculatePricing({ input_audio_seconds: 10 }, GROQ_CARD, {}).totalNanos;

	it.each([
		["audio.transcription", execTranscription, "/audio/transcriptions"],
		["audio.translations", execTranslation, "/audio/translations"],
	] as const)("bills a 3-second clip as 10 seconds (%s)", async (endpoint, exec, path) => {
		const result = await run(exec, "groq", endpoint, path, { file: wav(3), response_format: "json" }, { text: "hi" });
		expect(result.bill.usage.input_audio_seconds).toBe(10);
		// Before: 3 seconds.
		expect(calculatePricing(result.bill.usage, GROQ_CARD, {}).totalNanos).toBe(tenSeconds);
	});

	it("bills longer clips at their length", async () => {
		const result = await run(execTranscription, "groq", "audio.transcription", "/audio/transcriptions",
			{ file: wav(25), response_format: "json" }, { text: "hi" });
		expect(result.bill.usage.input_audio_seconds).toBe(25);
	});

	it("leaves other providers' short clips alone", async () => {
		const result = await run(execTranscription, "openai", "audio.transcription", "/audio/transcriptions",
			{ model: "whisper-1", file: wav(3), response_format: "json" }, { text: "hi" });
		expect(result.bill.usage.input_audio_seconds).toBe(3);
		expect(result.bill.usage).not.toHaveProperty("input_audio_minutes");
	});
});
