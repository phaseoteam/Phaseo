import { describe, expect, it } from "vitest";
import { chatPrompt } from "./chat";
import { demoItems, demoRuns } from "./demo";
import { notesForPrompt } from "./notes";

const now = Date.UTC(2026, 9, 22, 12);
const items = demoItems(now);
const item = items.find((entry) => entry.number === 3131)!;

describe("chat prompt", () => {
	it("tells the agent what Factory knows, the rules, and the message", () => {
		const prompt = chatPrompt({ item, body: "Usage values are decimal strings.", runs: demoRuns(now), branch: "factory/3131-usage", notes: notesForPrompt([{ id: "n", text: "Run pnpm test", at: now }], []), message: "What's the cause?" });
		expect(prompt).toContain("phaseo-app/phaseo issue #3131");
		expect(prompt).toContain("checkout of factory/3131-usage");
		expect(prompt).toContain("don't change any files");
		expect(prompt).toContain("- R1: Run pnpm test");
		expect(prompt).toContain("Usage values are decimal strings.");
		expect(prompt).toMatch(/- Triage: done \(Bug\)\. /);
		expect(prompt.trim().endsWith("Their message:\nWhat's the cause?")).toBe(true);
	});

	it("includes the GitHub comments, newest kept, without bots", () => {
		const comments = [
			{ author: "maya", body: "I pasted the code from an email.", at: 1 },
			{ author: "ci-bot[bot]", body: "Build passed", at: 2 },
			{ author: "you", body: "Thanks for the report.\n\n<sub>Asked by Phaseo Factory.</sub>", at: 3, factory: true },
		];
		const prompt = chatPrompt({ item, body: "", runs: [], message: "Hi", comments });
		expect(prompt).toContain("@maya:\nI pasted the code from an email.");
		expect(prompt).toContain("@you (posted by Factory):");
		expect(prompt).not.toContain("Build passed");
	});

	it("brings the conversation along when another agent takes over, without tool steps", () => {
		const prompt = chatPrompt({ item, body: "", runs: [], message: "And now?", history: [{ at: 1, role: "you", text: "Hi" }, { at: 2, role: "tool", text: "Read src/a.ts" }, { at: 3, role: "agent", text: "Hello" }] });
		expect(prompt).toContain("Them: Hi\nAgent: Hello");
		expect(prompt).not.toContain("Read src/a.ts");
		expect(prompt).toContain("no checkout of this repository");
	});
});
