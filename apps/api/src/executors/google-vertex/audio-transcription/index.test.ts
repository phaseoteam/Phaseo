import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ GOOGLE_VERTEX_ACCESS_TOKEN: "test-token", GOOGLE_VERTEX_PROJECT: "project", GOOGLE_VERTEX_LOCATION: "global" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any = {}) => ({ ir: { model: "gemini-3.5-transcribe-preview", file: new File(["audio"], "test.wav", { type: "audio/wav" }), ...ir }, providerId: "google-vertex", endpoint: "audio.transcriptions" as any, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });

it("uses Vertex OAuth and native transcription config, words and usage", async () => {
	const mock = installFetchMock([{ match: url => url === "https://aiplatform.googleapis.com/v1/projects/project/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent", response: jsonResponse({ responseId: "native", candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Hello", audioTranscription: { speakerLabel: "speaker_1", words: [{ word: "Hello", startOffset: "0.1s", endOffset: "0.5s" }] } }] } }], usageMetadata: { promptTokenCount: 30, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 30 }], candidatesTokenCount: 2 } }) }]);
	try {
		const result = await executor(args({ language: "en-US", diarize: true, timestampGranularities: ["word"], keywords: ["Phaseo"] }));
		expect(mock.calls[0].bodyJson).toMatchObject({ contents: [{ parts: [{ inlineData: { data: "YXVkaW8=", mimeType: "audio/wav" } }] }], generationConfig: { audioTranscriptionConfig: { languageCodes: ["en-US"], diarization: true, wordTimestamp: true, customVocabulary: ["Phaseo"] } } });
		expect(result.kind === "completed" && result.ir).toMatchObject({ text: "Hello", words: [{ word: "Hello", start: 0.1, end: 0.5, speaker: "speaker_1" }] });
		expect(result.bill.usage).toMatchObject({ input_audio_tokens: 30, output_text_tokens: 2 });
	} finally { mock.restore(); }
});

it.each([{ stream: true }, { timestampGranularities: ["segment"] }, { diarize: true, rawRequest: { config: { google: { transcription_mode: "smart" } } } }])("rejects incompatible controls: %j", async ir => {
	const mock = installFetchMock([]);
	try { expect((await executor(args(ir))).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); } finally { mock.restore(); }
});

it("rejects region configuration unsupported by the preview", async () => {
	teardownTestRuntime();
	setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "project", GOOGLE_VERTEX_LOCATION: "europe-west4" } as any);
	const mock = installFetchMock([]);
	try { expect((await executor(args())).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); } finally { mock.restore(); }
});
