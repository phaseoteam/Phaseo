import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
beforeEach(() => setupRuntimeFromEnv({ GOOGLE_AI_STUDIO_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (extra: any = {}) => ({ ir: { model: "gemini-3.5-transcribe", file: new Blob(["audio"], { type: "audio/wav" }), ...extra }, providerId: "google-ai-studio", endpoint: "audio.transcription" as const, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
it("maps inline audio and annotations through the native Interactions contract", async () => {
	const mock = installFetchMock([{ match: url => url.endsWith("/v1beta/interactions"), response: jsonResponse({ id: "native", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "Hello", annotations: [{ type: "word_info", text: "Hello", start_offset: "0.100s", end_offset: "0.450s", speaker: "spk_1" }] }] }], usage: { input_tokens_by_modality: [{ modality: "audio", tokens: 50 }], total_output_tokens: 2 } }) }]);
	try {
		const result = await executor(args({ language: "en-GB", diarize: true, timestampGranularities: ["word"] }));
		expect(mock.calls[0].bodyJson).toMatchObject({ input: [{ type: "audio", data: "YXVkaW8=", mime_type: "audio/wav" }], generation_config: { transcription_config: { language_codes: ["en-GB"], mode: { type: "verbatim", diarization_mode: "speaker", timestamp_granularities: ["word"] } } } });
		expect(result.kind === "completed" && result.ir).toMatchObject({ text: "Hello", words: [{ word: "Hello", start: 0.1, end: 0.45, speaker: "spk_1" }] });
		expect(result.bill.usage).toMatchObject({ input_audio_tokens: 50, output_text_tokens: 2 });
	} finally { mock.restore(); }
});
it("rejects incompatible vocabulary and diarization without submitting", async () => {
	const mock = installFetchMock([]);
	try { expect((await executor(args({ contextBias: ["Phaseo"], diarize: true }))).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); } finally { mock.restore(); }
});
