import { describe, expect, it } from "vitest";
import { asksReporter, countFiles, parseReport, pullRequestBody, reportMarkdown, reporterComment, runOutcome, stageOutcome } from "./report";
import { emptyStages, laneFor, reportRules } from "./stages";
import { demoItems, demoRuns } from "./demo";

const REPORT = `I added the test and ran it.

Summary: The weekly total reads 0 for decimal strings.
Verdict: Reproduced
Proof:
- usage-week-zero.png: Usage reads 0 tokens this week
- \`node usage.test.mjs\`: 1 failed, expected 1532 and got 0`;

describe("parseReport", () => {
	it("reads the summary, verdict and proof, and captions files the agent named", () => {
		const report = parseReport(REPORT, [{ name: "usage-week-zero.png", kind: "image", bytes: 10 }, { name: "extra.log", kind: "text", bytes: 5 }]);
		expect(report.summary).toBe("The weekly total reads 0 for decimal strings.");
		expect(report.verdict).toBe("Reproduced");
		expect(report.notes).toEqual(["`node usage.test.mjs`: 1 failed, expected 1532 and got 0"]);
		expect(report.files[0].caption).toBe("Usage reads 0 tokens this week");
		expect(report.files[1].caption).toBeUndefined();
	});

	it("counts Fix finding an open pull request that already fixes the issue as a success that needs you", () => {
		const report = parseReport("Summary: PR #4 already fixes this, so I changed nothing.\nVerdict: Not fixed\nProof:\n- before.txt: throws\n- after.txt: returns 500\n**Already fixed by:** #4", [{ name: "before.txt", kind: "text", bytes: 1 }, { name: "after.txt", kind: "text", bytes: 1 }]);
		expect(report.fixedBy).toBe(4);
		expect(report.files.map((file) => file.caption)).toEqual(["throws", "returns 500"]);
		const stage = stageOutcome("fix", report, true);
		expect(stage).toEqual({ status: "needs-you", summary: "PR #4 already fixes this, so I changed nothing." });
		expect(stageOutcome("fix", { ...report, summary: "I changed nothing." }, true).summary).toBe("Pull request #4 already fixes this. I changed nothing.");
		expect(runOutcome({ status: "succeeded", stage: "fix" }, report, stage)).toEqual({ kind: "success", why: "Found #4 already fixes it" });
	});

	it("reads a question and markdown-bold field names", () => {
		const report = parseReport("**Summary:** Stuck.\n**Verdict:** Not fixed\nQuestion: Should zero-cost rows count?");
		expect(report.summary).toBe("Stuck.");
		expect(report.verdict).toBe("Not fixed");
		expect(report.question).toBe("Should zero-cost rows count?");
	});
});

describe("stageOutcome", () => {
	const proof = parseReport(REPORT, []);

	it("passes a stage with proof and the pass verdict", () => {
		expect(stageOutcome("reproduce", proof, true).status).toBe("done");
	});

	it("stops for a person without proof, on a question, or on anything but a pass", () => {
		expect(stageOutcome("fix", parseReport("Summary: Done.\nVerdict: Fixed"), true)).toEqual({ status: "needs-you", summary: "No proof attached. Done." });
		expect(stageOutcome("fix", parseReport("Summary: Done.\nVerdict: Fixed"), false).status).toBe("done");
		expect(stageOutcome("reproduce", parseReport("Summary: x\nQuestion: Which flag?"), true).summary).toBe("Asks: Which flag?");
		expect(stageOutcome("reproduce", { ...proof, verdict: "Could not reproduce" }, true).status).toBe("needs-you");
		expect(stageOutcome("verify", { ...proof, verdict: "Failed" }, true).status).toBe("failed");
	});

	it("doesn't ask a clean review or triage for proof", () => {
		expect(stageOutcome("review", parseReport("Summary: Clean.\nVerdict: No findings"), true).status).toBe("done");
		expect(stageOutcome("triage", parseReport("Summary: Real.\nVerdict: Bug"), true).status).toBe("done");
		expect(stageOutcome("review", parseReport("Summary: 2.\nVerdict: Findings"), true).status).toBe("needs-you");
	});
});

describe("GitHub text", () => {
	const now = Date.UTC(2026, 9, 22, 12);
	const runs = demoRuns(now).filter((run) => run.itemId.endsWith("#3131") && run.status === "succeeded");
	const issue = demoItems(now).find((item) => item.number === 3131)!;

	it("counts proof files in words", () => {
		expect(countFiles([{ name: "a.png", kind: "image", bytes: 1 }, { name: "b.png", kind: "image", bytes: 1 }, { name: "c.log", kind: "text", bytes: 1 }])).toBe("2 screenshots and 1 log");
	});

	it("opens pull requests that close the issue and carry each stage's proof", () => {
		const body = pullRequestBody(issue, runs, (id) => id);
		expect(body.startsWith("Fixes #3131")).toBe(true);
		expect(body).toContain("**Reproduce** (claude-opus)");
		expect(body).toContain("usage-week-zero.png: Usage → Tokens → This week reads 0");
		expect(body).toContain("saved in Phaseo Factory");
	});

	it("describes the fix that worked, not an earlier attempt that didn't", () => {
		const base = runs.find((run) => run.report)!;
		const attempt = (id: string, at: number, verdict: string, summary: string) => ({ ...base, id, stage: "fix" as const, startedAt: at, report: { ...base.report!, verdict, summary, files: [], notes: [] } });
		const body = pullRequestBody(issue, [attempt("first", now - 120_000, "Not fixed", "Couldn't make the test pass."), attempt("second", now - 60_000, "Fixed", "Counted a missing quantity as one.")], (id) => id);
		expect(body).not.toContain("Couldn't make the test pass.");
		expect(body).toContain("Counted a missing quantity as one.");
		expect(body.split("**Fix**").length).toBe(2);
	});

	it("references attached screenshots by their local path, for gh --attach to swap in", () => {
		const ref = (runId: string, name: string) => (name.endsWith(".png") ? `E:/worktrees/x/.factory/proof/${runId}/${name}` : undefined);
		const body = pullRequestBody(issue, runs, (id) => id, ref);
		expect(body).toMatch(/!\[Usage → Tokens → This week reads 0[^\]]*\]\(E:\/worktrees\/x\/\.factory\/proof\/[\w-]+\/usage-week-zero\.png\)/);
		const reproduce = runs.find((run) => run.stage === "reproduce")!;
		const comment = reportMarkdown(reproduce, "Opus 5.5", ref);
		expect(comment).toContain("](E:/worktrees/x/.factory/proof/");
		expect(comment).not.toMatch(/screenshots? saved in Phaseo Factory/);
	});
});

describe("asking the reporter", () => {
	const COULD_NOT = `I followed the steps on a fresh cart and the total showed $12.50.

Summary: The total shows two decimals on every amount I tried.
Verdict: Could not reproduce
Proof:
- \`npm test\`: 5 passed, 0 failed

Ask the reporter:
- Which amount did you enter? 12.5 and 1250 both show $12.50 for us.
- **Which browser and version** were you using?`;

	it("reads what the agent needs from the reporter, apart from the proof", () => {
		const report = parseReport(COULD_NOT);
		expect(report.ask).toEqual(["Which amount did you enter? 12.5 and 1250 both show $12.50 for us.", "Which browser and version were you using?"]);
		expect(report.notes).toEqual(["`npm test`: 5 passed, 0 failed"]);
		expect(parseReport("Summary: x\nVerdict: Reproduced\nProof:\n- a.txt: b").ask).toBeUndefined();
		expect(parseReport("Verdict: Could not reproduce\nAsk the reporter:\n- None").ask).toBeUndefined();
	});

	it("asks only when Reproduce failed or Triage needs more, and there's something to ask", () => {
		expect(asksReporter("reproduce", parseReport(COULD_NOT))).toBe(true);
		expect(asksReporter("reproduce", parseReport(COULD_NOT.replace("Could not reproduce", "Reproduced")))).toBe(false);
		expect(asksReporter("triage", parseReport(COULD_NOT.replace("Could not reproduce", "Needs more information")))).toBe(true);
		expect(asksReporter("triage", parseReport(COULD_NOT.replace("Could not reproduce", "Not a bug")))).toBe(false);
		expect(asksReporter("fix", parseReport(COULD_NOT.replace("Could not reproduce", "Not fixed")))).toBe(false);
	});

	it("writes the comment to the reporter, signed so Factory can tell it from their reply", () => {
		const report = parseReport(COULD_NOT);
		if (!asksReporter("reproduce", report)) throw new Error("expected an ask");
		const body = reporterComment("reproduce", report, 1);
		expect(body).toContain("We tried to make this happen and couldn't yet");
		expect(body).toContain("- Which browser and version were you using?");
		expect(body).toContain("**What we found so far:** The total shows two decimals on every amount I tried.");
		expect(body.trim().endsWith("<sub>Asked by Phaseo Factory. Reply here and we'll take another look.</sub>")).toBe(true);
		expect(reporterComment("reproduce", report, 2)).toContain("(follow-up 1)");
	});

	it("tells Triage and Reproduce how to ask, and nothing else", () => {
		expect(reportRules("reproduce", ".factory/proof/x")).toContain("Ask the reporter:");
		expect(reportRules("triage", ".factory/proof/x")).toContain("Ask the reporter:");
		expect(reportRules("fix", ".factory/proof/x")).not.toContain("Ask the reporter:");
	});

	it("puts an item waiting on its reporter in its own lane", () => {
		const [item] = demoItems(Date.now());
		expect(laneFor({ ...item!, kind: "issue", state: "open", stages: { ...emptyStages(), triage: { status: "done" }, reproduce: { status: "waiting" } } })).toBe("waiting");
	});
});

describe("risk, duplicates, notes and outcomes", () => {
	it("reads Review's risk, Triage's duplicate and what to remember", () => {
		const report = parseReport([
			"Summary: Two findings.",
			"Verdict: Findings",
			"Proof:",
			"- `pnpm test`: 1 failed",
			"Remember:",
			"- Tests need PGlite: run pnpm db:test first",
			"- none",
			"Risk: High - rewrites every streamed response",
			"Duplicate of: #42",
		].join("\n"));
		expect(report.risk).toEqual({ level: "high", why: "rewrites every streamed response" });
		expect(report.duplicateOf).toBe(42);
		expect(report.remember).toEqual([{ scope: "repo", text: "Tests need PGlite: run pnpm db:test first", checked: undefined }]);
		expect(report.notes).toEqual(["`pnpm test`: 1 failed"]);
		expect(parseReport("Risk: low").risk).toEqual({ level: "low" });
		expect(parseReport("Risk: unclear").risk).toBeUndefined();
	});

	it("stops Triage for a person when it finds a duplicate", () => {
		expect(stageOutcome("triage", { summary: "Same as #42.", verdict: "Bug", notes: [], files: [], duplicateOf: 42 }, true)).toEqual({ status: "needs-you", summary: "Looks like a duplicate of #42. Same as #42." });
	});

	it("says why a run ended where it did", () => {
		const run = { status: "succeeded" as const, stage: "reproduce" as const };
		const empty = { notes: [], files: [] };
		expect(runOutcome(run, empty, { status: "done" })).toEqual({ kind: "success" });
		expect(runOutcome({ ...run, status: "failed", summary: "Codex stopped with exit code 1" }, undefined, { status: "failed" })).toEqual({ kind: "failed", why: "Codex stopped with exit code 1" });
		expect(runOutcome({ ...run, status: "cancelled" }, undefined, { status: "idle" })).toEqual({ kind: "stopped" });
		expect(runOutcome(run, { ...empty, question: "Which browser?" }, { status: "needs-you", summary: "Asks: Which browser?" }).kind).toBe("blocked");
		expect(runOutcome(run, empty, { status: "needs-you", summary: "No proof attached." })).toEqual({ kind: "blocked", why: "No proof attached" });
		expect(runOutcome(run, { ...empty, notes: ["x"], verdict: "Could not reproduce" }, { status: "needs-you", summary: "Could not reproduce" })).toEqual({ kind: "failed", why: "Could not reproduce" });
		// A review that finds problems did its job; the fix it checked is what's flawed.
		expect(runOutcome({ ...run, stage: "review" }, { ...empty, notes: ["x"], verdict: "Findings", summary: "2 findings" }, { status: "needs-you", summary: "2 findings" })).toEqual({ kind: "success", why: "Found problems: 2 findings" });
	});
});
