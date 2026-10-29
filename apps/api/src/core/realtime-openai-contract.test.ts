import { describe, expect, it } from "vitest";
import { createRealtimeSessionSchema } from "@/routes/v1/data/realtime-sessions";

describe("OpenAI Realtime contract", () => {
	it("rejects unsupported session types instead of silently creating a voice-agent session", () => {
		expect(createRealtimeSessionSchema.safeParse({
			type: "realtime",
			model: "openai/gpt-realtime-2",
			voice: "marin",
		}).success).toBe(true);
		expect(createRealtimeSessionSchema.safeParse({
			type: "transcription",
			model: "openai/gpt-live-transcribe",
		}).success).toBe(false);
		expect(createRealtimeSessionSchema.safeParse({
			type: "translation",
			model: "openai/gpt-realtime-translate",
		}).success).toBe(false);
		expect(createRealtimeSessionSchema.safeParse({
			type: "realtime",
			model: "openai/gpt-realtime-2",
			audio: { output: { voice: "marin" } },
		}).success).toBe(false);
	});
});
