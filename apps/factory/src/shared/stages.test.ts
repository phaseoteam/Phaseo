import { describe, expect, it } from "vitest";
import { demoItems } from "./demo";
import { notesForPrompt } from "./notes";
import { currentStage, emptyStages, issueBody, laneFor, stagePrompt, stagesFor } from "./stages";
import type { WorkItem } from "./types";

const now = Date.UTC(2026, 9, 21, 18);
const items = demoItems(now);
const byNumber = (number: number) => items.find((item) => item.number === number) as WorkItem;

describe("open pull requests in the prompt", () => {
	const issue = byNumber(3117);
	const pull = { ...items.find((item) => item.kind === "pull")!, number: 4000, title: "Round discounts", body: "Fixes #3117 by rounding.", linked: 3117, state: "draft" as const, branch: "fix-round" };

	it("tells every issue stage about them, and Fix not to write a second fix", () => {
		const fix = stagePrompt(issue, "fix", undefined, { pulls: [pull] });
		expect(fix).toContain("#4000: Round discounts (draft, by @");
		expect(fix).toContain("says it fixes this issue");
		expect(fix).toContain("Don't open another pull request");
		expect(fix).toContain("If it fixes the issue, don't change anything");
		expect(stagePrompt(issue, "triage", undefined, { pulls: [pull] })).toContain("whether that pull request looks like it fixes it");
	});

	it("has Fix look on GitHub when Factory knows of none", () => {
		expect(stagePrompt(issue, "fix")).toContain(`gh pr list --state open --search "3117"`);
		expect(stagePrompt(issue, "triage")).not.toContain("gh pr list");
	});
});

describe("proof in the prompt", () => {
	it("asks for the result shown before and after, not just command output", () => {
		const fix = stagePrompt(byNumber(3117), "fix");
		expect(fix).toContain("the same thing captured before and after your change");
		expect(fix).toContain("before: 840 ms, after: 95 ms");
		expect(fix).toContain("on its own it isn't proof");
		expect(stagePrompt(byNumber(3117), "triage")).not.toContain("git worktree add");
	});
});

describe("stages", () => {
	it("starts pull requests at review", () => {
		expect(stagesFor({ kind: "pull" }).map((stage) => stage.id)).toEqual(["review", "verify"]);
		expect(stagesFor({ kind: "issue" }).map((stage) => stage.id)).toEqual(["triage", "reproduce", "fix"]);
	});

	it("puts each item in the lane its stages call for", () => {
		expect(laneFor(byNumber(3131))).toBe("running");
		expect(laneFor(byNumber(3128))).toBe("needs-you");
		expect(laneFor(byNumber(3122))).toBe("needs-you");
		expect(laneFor(byNumber(3125))).toBe("queued");
		expect(laneFor(byNumber(3117))).toBe("ready");
		expect(laneFor(byNumber(3107))).toBe("done");
		expect(laneFor(byNumber(3098))).toBe("done");
	});

	it("skips passed and skipped stages when picking the current one", () => {
		expect(currentStage(byNumber(3125))?.id).toBe("fix");
		expect(currentStage({ ...byNumber(3117), stages: emptyStages() })?.id).toBe("triage");
		expect(currentStage(byNumber(3101))).toBeUndefined();
	});

	it("writes a prompt with the item, the stage brief and the proof rules", () => {
		const prompt = stagePrompt(byNumber(3131), "reproduce", undefined, { proofDir: "/tmp/proof/run-1" });
		expect(prompt).toContain("issue #3131");
		expect(prompt).toContain("Stage: Reproduce.");
		expect(prompt).toContain("Do not fix the bug.");
		expect(prompt).toContain("Save the files in /tmp/proof/run-1");
		expect(prompt).toContain("Verdict: one of Reproduced or Could not reproduce.");
		expect(prompt).toContain("starts with \"Question:\" and stop there.");
		expect(prompt).toContain("only ask what would change your result.");
		// Every stage can leave a note for the runs after it.
		expect(prompt).toContain("- computer: something about this computer");
		// With no notes to check, the prompt doesn't ask for a Notes check.
		expect(prompt).not.toContain("Notes check:");
	});

	it("gives every run the repository's notes, and Triage the issues that read like this one", () => {
		const issue = byNumber(3131);
		const notes = notesForPrompt([{ id: "n", text: "Run pnpm test from apps/web.", at: now }], [{ id: "c", text: "Use npm.cmd in PowerShell.", at: now }]);
		const similar = [{ id: "x#1", number: 1, title: "Weekly totals are 0", state: "open" as const, score: 0.6 }];
		const triage = stagePrompt(issue, "triage", undefined, { notes, similar, similarBodies: new Map([["x#1", "Usage shows zero tokens"]]) });
		expect(triage).toContain("- R1: Run pnpm test from apps/web.");
		expect(triage).toContain("- C1: Use npm.cmd in PowerShell.");
		expect(triage).toContain("Notes check:");
		expect(triage).toContain("- #1 (open): Weekly totals are 0\n  Usage shows zero tokens");
		expect(triage).toContain("Duplicate of: #number");
		const fix = stagePrompt(issue, "fix", undefined, { notes, similar });
		expect(fix).toContain("Run pnpm test from apps/web.");
		expect(fix).not.toContain("Weekly totals are 0");
		expect(fix).not.toContain("Duplicate of");
	});

	it("keeps the fixer's own account out of Review on Factory's pull requests, and asks for a risk rating", () => {
		const pull = { ...byNumber(3133), body: "Fixes #3126\n\n## What changed\n\nSwapped the formatter, all good." };
		const issue = byNumber(3126);
		const review = stagePrompt(pull, "review", undefined, { fixes: issue });
		expect(review).not.toContain("all good");
		expect(review).toContain("left out on purpose");
		expect(review).toContain(`It fixes issue #3126`);
		expect(review).toContain("Risk: low, medium or high");
		// Someone else's pull request keeps its description: it says what they meant to do.
		const theirs = stagePrompt({ ...pull, branch: "feat/theirs" }, "review", undefined, {});
		expect(theirs).toContain("all good");
	});

	it("turns Done when lines into a checklist, whatever bullets people typed", () => {
		const body = issueBody("The total reads 0.", "- shows $12.50\n\n* [ ] a test covers en-GB\nno bullet");
		expect(body).toContain("## Done when\n\n- [ ] shows $12.50\n- [ ] a test covers en-GB\n- [ ] no bullet");
		expect(issueBody("", "")).not.toContain("Done when");
	});

	it("gives a pull request's stages the issue it fixes", () => {
		const prompt = stagePrompt(byNumber(3133), "verify", undefined, { fixes: byNumber(3126) });
		expect(prompt).toContain("It fixes issue #3126: Billing page shows US$12.50 instead of $12.50");
		expect(prompt).toContain("Done when list");
	});
});
