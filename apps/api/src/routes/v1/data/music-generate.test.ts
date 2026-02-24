import { describe, expect, it } from "vitest";
import { __musicGenerateTestUtils } from "./music-generate";

describe("music-generate route helpers", () => {
	it("maps Suno provider statuses to gateway status enum", () => {
		expect(__musicGenerateTestUtils.mapSunoTaskStatus("PENDING")).toBe("in_progress");
		expect(__musicGenerateTestUtils.mapSunoTaskStatus("SUCCESS")).toBe("completed");
		expect(__musicGenerateTestUtils.mapSunoTaskStatus("GENERATE_AUDIO_FAILED")).toBe("failed");
		expect(__musicGenerateTestUtils.mapSunoTaskStatus("UNKNOWN_STATE")).toBe("queued");
	});

	it("parses Suno output and computes total duration seconds", () => {
		const parsed = __musicGenerateTestUtils.parseSunoOutput({
			data: {
				response: {
					sunoData: [
						{ id: "a1", audioUrl: "https://a.example/1.mp3", duration: 3 },
						{ id: "a2", audio_url: "https://a.example/2.mp3", durationSeconds: 5 },
					],
				},
			},
		});

		expect(parsed.output.length).toBe(2);
		expect(parsed.output[0]?.audio_url).toBe("https://a.example/1.mp3");
		expect(parsed.output[1]?.audio_url).toBe("https://a.example/2.mp3");
		expect(parsed.totalDurationSeconds).toBe(8);
	});

	it("parses MiniMax output and computes total duration seconds", () => {
		const parsed = __musicGenerateTestUtils.parseMiniMaxOutput({
			id: "mini_1",
			audio_url: "https://mini.example/audio.mp3",
			duration: 6,
		});

		expect(parsed.output.length).toBe(1);
		expect(parsed.output[0]?.audio_url).toBe("https://mini.example/audio.mp3");
		expect(parsed.totalDurationSeconds).toBe(6);
	});
});

