import { describe, expect, it } from "vitest";
import { historyPageSizes, validateChatPreferences } from "../../shared/chatPreferences";
import { conversationWindow, conversationWindowSize } from "../../shared/conversationPage";
import { markdownChunks } from "./LongMarkdown";

const paragraph = (n: number) => `**Step ${n}.** Checking the retry path for provider ${n % 17}, which keeps its cache key.\n\n- first point\n- second point\n`;
const long = Array.from({ length: 400 }, (_, n) => paragraph(n)).join("\n");

describe("markdownChunks", () => {
	it("keeps short text whole", () => {
		expect(markdownChunks("Short **reasoning**.")).toEqual(["Short **reasoning**."]);
	});

	it("splits long text at block boundaries, losing nothing", () => {
		const chunks = markdownChunks(long, 2_000);
		expect(chunks.length).toBeGreaterThan(10);
		expect(chunks.join("\n\n")).toBe(long);
		for (const chunk of chunks) expect(chunk).toMatch(/^\S/);
	});

	it("never cuts inside a code fence, a formula or an indented block", () => {
		const code = "```ts\n" + Array.from({ length: 300 }, (_, n) => `const a${n} = ${n};\n`).join("\n") + "```";
		const math = "$$\n" + Array.from({ length: 300 }, (_, n) => `x_${n} = ${n}\n`).join("\n") + "$$";
		const nested = "- item\n" + Array.from({ length: 300 }, (_, n) => `\n  continued ${n}`).join("\n");
		for (const block of [code, math, nested]) {
			const text = `${long.slice(0, 3_000)}\n\n${block}\n\nAfter.`;
			const chunks = markdownChunks(text, 1_000);
			expect(chunks.join("\n\n")).toBe(text);
			expect(chunks.filter(chunk => chunk.includes(block))).toHaveLength(1);
		}
	});

	it("keeps earlier pieces unchanged as text streams in", () => {
		const before = markdownChunks(long.slice(0, 40_000), 2_000), after = markdownChunks(long, 2_000);
		expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, -1));
	});

	it("keeps text with reference definitions or HTML blocks whole", () => {
		expect(markdownChunks(`${long}\n\n[docs]: https://example.com`, 2_000)).toHaveLength(1);
		expect(markdownChunks(`<details>\n\n${long}\n\n</details>`, 2_000)).toHaveLength(1);
	});
});

describe("history page size", () => {
	it("defaults to 25 and takes 10 to 200", () => {
		expect(validateChatPreferences({}).historyPageSize).toBe(25);
		expect(validateChatPreferences({ historyPageSize: 200 }).historyPageSize).toBe(200);
		for (const value of [9, 201, 25.5, "50"]) expect(() => validateChatPreferences({ historyPageSize: value })).toThrow("Messages per page");
		expect(historyPageSizes).toEqual({ default: 25, minimum: 10, maximum: 200 });
	});

	it("keeps two pages drawn, and at least 100 messages", () => {
		expect(conversationWindowSize(25)).toBe(100);
		expect(conversationWindowSize(200)).toBe(400);
		const entries = Array.from({ length: 500 }, (_, index) => ({ id: String(index), role: "user" as const, text: "hi", createdAt: "" }));
		expect(conversationWindow(entries, "start", 400)).toHaveLength(400);
		expect(conversationWindow(entries, "end")).toHaveLength(100);
	});
});
