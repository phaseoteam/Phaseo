import { isLiveTranscriptionModel } from "./useLiveTranscription";

describe("isLiveTranscriptionModel", () => {
	it("accepts realtime transcription models", () => {
		expect(isLiveTranscriptionModel({ modelId: "mistral/voxtral-mini-transcribe-realtime", capabilities: ["audio.realtime"] })).toBe(true);
		expect(isLiveTranscriptionModel({ modelId: "mistral/voxtral-mini-transcribe-realtime-3", capabilities: ["Audio.Realtime "] })).toBe(true);
	});

	it("rejects voice conversation models and file transcription models", () => {
		expect(isLiveTranscriptionModel({ modelId: "openai/gpt-realtime-2", capabilities: ["audio.realtime"] })).toBe(false);
		expect(isLiveTranscriptionModel({ modelId: "mistral/voxtral-mini-transcribe-3", capabilities: ["audio.transcription"] })).toBe(false);
		expect(isLiveTranscriptionModel({ modelId: "mistral/voxtral-mini-transcribe-realtime", capabilities: null })).toBe(false);
	});
});
