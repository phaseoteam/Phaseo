import { describe, expect, it } from "vitest";
import { latestLine } from "./BackgroundWork";

describe("background command status line", () => {
	it("shows the newest printed line without colour codes or blank lines", () => {
		expect(latestLine("starting\n\u001b[32m  ready\u001b[0m in 300 ms\n\n")).toBe("ready in 300 ms");
		expect(latestLine("50%\r75%\r100%")).toBe("100%");
		expect(latestLine("")).toBe("");
	});
});
