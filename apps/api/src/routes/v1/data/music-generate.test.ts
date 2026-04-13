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

	it("maps MiniMax numeric status codes and parses hex audio payloads", () => {
		expect(__musicGenerateTestUtils.mapMiniMaxTaskStatus(2)).toBe("completed");
		expect(__musicGenerateTestUtils.mapMiniMaxTaskStatus(1)).toBe("in_progress");
		expect(__musicGenerateTestUtils.mapMiniMaxTaskStatus(0)).toBe("queued");

		const parsed = __musicGenerateTestUtils.parseMiniMaxOutput({
			id: "mini_hex",
			data: {
				audio: "61".repeat(128),
			},
		});

		expect(parsed.output[0]?.audio_url).toBeNull();
		expect(parsed.output[0]?.audio_base64).toBe(Buffer.from("a".repeat(128), "utf-8").toString("base64"));
	});

	it("normalizes metadata statuses and detects google music provider aliases", () => {
		expect(__musicGenerateTestUtils.normalizeMusicStatus("running")).toBe("in_progress");
		expect(__musicGenerateTestUtils.normalizeMusicStatus("cancelled")).toBe("failed");
		expect(__musicGenerateTestUtils.normalizeMusicStatus("")).toBe("completed");

		expect(__musicGenerateTestUtils.isGoogleMusicProvider("google")).toBe(false);
		expect(__musicGenerateTestUtils.isGoogleMusicProvider("google-ai-studio")).toBe(true);
		expect(__musicGenerateTestUtils.isGoogleMusicProvider("suno")).toBe(false);
	});
});

