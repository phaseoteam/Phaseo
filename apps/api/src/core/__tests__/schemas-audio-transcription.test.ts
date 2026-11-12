import { describe, expect, it } from "vitest";
import { AudioTranscriptionSchema } from "../schemas";

function audioFile(name = "sample.wav", size = 4, type = "audio/wav") {
	return new File([new Uint8Array(size)], name, { type });
}

describe("OpenAI audio transcription schema", () => {
	it("accepts current gpt-transcribe context and streaming fields", () => {
		const parsed = AudioTranscriptionSchema.parse({
			model: "openai/gpt-transcribe",
			file: audioFile(),
			languages: ["en", "fr"],
			keywords: ["Phaseo", "AC-42"],
			prompt: "A support call",
			temperature: 1,
			stream: "true",
		});
		expect(parsed.stream).toBe(true);
		expect(parsed.languages).toEqual(["en", "fr"]);
	});

	it.each([
		["temperature above one", { temperature: 1.1 }, "temperature"],
		["languages on GPT-4o", { languages: ["en"] }, "languages"],
		["keywords on GPT-4o", { keywords: ["Phaseo"] }, "keywords"],
		["singular and plural language", { language: "en", languages: ["fr"] }, "languages"],
		["invalid keyword characters", { keywords: ["bad\nterm"] }, "keywords"],
		["known speakers on a non-diarization model", { known_speaker_names: ["agent"], known_speaker_references: ["data:audio/wav;base64,AQID"] }, "known_speaker_names"],
	])("rejects %s", (_name, fields, expectedPath) => {
		const result = AudioTranscriptionSchema.safeParse({ model: "gpt-4o-transcribe", file: audioFile(), ...fields });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toContain(expectedPath);
	});

	it("rejects unsupported files and the OpenAI 25 MB limit", () => {
		const unsupported = AudioTranscriptionSchema.safeParse({ model: "whisper-1", file: audioFile("sample.txt", 4, "text/plain") });
		expect(unsupported.success).toBe(false);
		const oversized = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: "audio/mpeg" });
		const tooLarge = AudioTranscriptionSchema.safeParse({ model: "whisper-1", file: oversized });
		expect(tooLarge.success).toBe(false);
	});

	it("requires matched diarization speaker references as data URLs", () => {
		const result = AudioTranscriptionSchema.safeParse({
			model: "gpt-4o-transcribe-diarize",
			file: audioFile(),
			known_speaker_names: ["agent", "customer"],
			known_speaker_references: ["not-a-data-url"],
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toContain("known_speaker_references");
	});
});

describe("Mistral audio transcription schema", () => {
	it("accepts URL input, diarization, context bias, timestamps, and streaming", () => {
		const parsed = AudioTranscriptionSchema.parse({
			model: "mistral/voxtral-mini-transcribe-2",
			file_url: "https://example.com/call.mp3",
			diarize: "true",
			context_bias: ["Phaseo", "AC-42"],
			timestamp_granularities: ["word"],
			stream: "true",
		});
		expect(parsed.diarize).toBe(true);
		expect(parsed.stream).toBe(true);
	});

	it("requires one audio source and rejects language with timestamps", () => {
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
			file: audioFile(),
			file_id: "file_123",
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
			file_url: "https://example.com/call.mp3",
			language: "en",
			timestamp_granularities: ["segment"],
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
			file_url: "https://example.com/call.mp3",
			language: "english",
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
			file_url: "https://example.com/call.mp3",
			context_bias: ["two words"],
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "mistral/voxtral-mini-transcribe-2",
			file_url: "https://example.com/call.mp3",
			context_bias: Array.from({ length: 101 }, (_, index) => `term${index}`),
		}).success).toBe(false);
	});

	it.each(["mistral/voxtral-mini-transcribe-3", "mistral/voxtral-small-transcribe-3"])("accepts %s phrases, sentences and long lists in context_bias", (model) => {
		const parsed = AudioTranscriptionSchema.safeParse({
			model,
			file_url: "https://example.com/call.mp3",
			context_bias: [
				"Phaseo Gateway",
				"A support call about billing, refunds and the AC-42 router.",
				...Array.from({ length: 150 }, (_, index) => `term ${index}`),
			],
		});
		expect(parsed.success).toBe(true);
	});

	it("keeps the single-term context_bias rule for non-Mistral models", () => {
		expect(AudioTranscriptionSchema.safeParse({
			model: "google/gemini-3.5-transcribe",
			file: audioFile(),
			context_bias: ["two words"],
		}).success).toBe(false);
	});
});

describe("Whisper large-v3 transcription schema", () => {
	it("allows uploads above 25 MB; each provider's own limit is checked per route", () => {
		const file = new File([new Uint8Array(30 * 1024 * 1024)], "call.mp3", { type: "audio/mpeg" });
		expect(AudioTranscriptionSchema.safeParse({ model: "openai/whisper-large-v3", file }).success).toBe(true);
		expect(AudioTranscriptionSchema.safeParse({ model: "openai/whisper-1", file }).success).toBe(false);
	});
});

describe("xAI audio transcription schema", () => {
	it.each(["spacex-ai/grok-transcribe", "spacex-ai/grok-voice-transcribe-2.0"])("accepts %s keyterms and uploads above 25 MB", (model) => {
		const result = AudioTranscriptionSchema.safeParse({
			model,
			file: new File([new Uint8Array(26 * 1024 * 1024)], "call.mp3", { type: "audio/mpeg" }),
			keywords: ["Phaseo", "Understand the Universe"],
		});
		expect(result.success).toBe(true);
	});
});

describe("ElevenLabs audio transcription schema", () => {
	it("accepts URL input, Scribe v2 keyterms, and its temperature range", () => {
		const parsed = AudioTranscriptionSchema.parse({
			model: "eleven-labs/scribe-v2",
			file_url: "https://example.com/call.mp3",
			keywords: ["Phaseo", "AC 42"],
			temperature: 2,
			diarize: true,
			config: { elevenlabs: { enable_logging: false, tag_audio_events: true } },
		});
		expect(parsed.file_url).toContain("call.mp3");
	});

	it("rejects multiple sources and invalid keyterms", () => {
		expect(AudioTranscriptionSchema.safeParse({
			model: "eleven-labs/scribe-v2",
			file: audioFile(),
			file_url: "https://example.com/call.mp3",
		}).success).toBe(false);
		expect(AudioTranscriptionSchema.safeParse({
			model: "eleven-labs/scribe-v2",
			file: audioFile(),
			keywords: ["six words are too many here now"],
		}).success).toBe(false);
	});

	it("accepts keyterms of exactly 50 characters and rejects 51", () => {
		const keyterm = (length: number) => "a".repeat(length);
		expect(AudioTranscriptionSchema.safeParse({
			model: "eleven-labs/scribe-v2",
			file: audioFile(),
			keywords: [keyterm(50)],
		}).success).toBe(true);
		const tooLong = AudioTranscriptionSchema.safeParse({
			model: "eleven-labs/scribe-v2",
			file: audioFile(),
			keywords: [keyterm(51)],
		});
		expect(tooLong.success).toBe(false);
		if (!tooLong.success) expect(tooLong.error.issues[0]?.path).toEqual(["keywords", 0]);
	});
});
