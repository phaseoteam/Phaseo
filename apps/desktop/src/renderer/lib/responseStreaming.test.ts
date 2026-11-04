import { describe, expect, it } from "vitest";
import { revealStreamingText } from "./responseStreaming";

describe("response streaming", () => {
	it("shows every token live, and nothing until the turn ends when waiting", () => {
		expect(revealStreamingText("Half a sent", "live")).toBe("Half a sent");
		expect(revealStreamingText("First paragraph.\n\nSecond", "turn")).toBe("");
	});

	it("shows finished paragraphs only", () => {
		expect(revealStreamingText("Still writing the first", "paragraph")).toBe("");
		expect(revealStreamingText("First line\nstill the first paragraph", "paragraph")).toBe("");
		expect(revealStreamingText("First paragraph.\n\nSecond is still", "paragraph")).toBe("First paragraph.");
		expect(revealStreamingText("One.\n\nTwo.\n\nThr", "paragraph")).toBe("One.\n\nTwo.");
		// The blank line itself must have arrived.
		expect(revealStreamingText("One.\n", "paragraph")).toBe("");
		expect(revealStreamingText("One.\n\n", "paragraph")).toBe("One.");
	});

	it("keeps a code block back until it closes, blank lines inside it included", () => {
		const open = "Run this:\n\n```ts\nconst a = 1;\n\nconst b";
		expect(revealStreamingText(open, "paragraph")).toBe("Run this:");
		expect(revealStreamingText(`${open} = 2;\n\`\`\`\n`, "paragraph")).toBe("Run this:\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```");
		// A longer fence is only closed by one at least as long.
		expect(revealStreamingText("````md\n```\ninner\n```\n", "paragraph")).toBe("");
		expect(revealStreamingText("````md\n```\ninner\n```\n````\n", "paragraph")).toBe("````md\n```\ninner\n```\n````");
		expect(revealStreamingText("~~~\ncode\n```\n", "paragraph")).toBe("");
	});
});
