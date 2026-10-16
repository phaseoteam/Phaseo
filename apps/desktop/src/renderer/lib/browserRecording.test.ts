import { describe, expect, it } from "vitest";
import { recordingBitrate, revealLabel } from "./browserRecording";

describe("browser recording", () => {
	it("scales the bitrate with the captured pixels, within T3 Code's bounds", () => {
		expect(recordingBitrate(320, 200, 30)).toBe(2_500_000);
		expect(recordingBitrate(1280, 800, 30)).toBe(2_500_000);
		expect(recordingBitrate(7680, 4320, 60)).toBe(50_000_000);
		expect(recordingBitrate()).toBe(3_110_400);
	});
	it("names the file manager as the computer does", () => {
		expect(revealLabel("win32")).toBe("Reveal in File Explorer");
		expect(revealLabel("darwin")).toBe("Reveal in Finder");
		expect(revealLabel("linux")).toBe("Reveal in Files");
	});
});
