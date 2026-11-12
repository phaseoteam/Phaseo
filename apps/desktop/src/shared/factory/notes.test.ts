import { describe, expect, it } from "vitest";
import { applyNoteReport, noteRefs, notesForPrompt, noteSimilarity, notesSection, parseNoteChecks, parseRemember } from "./notes";
import type { RepoNote } from "./types";

const note = (id: string, text: string, patch: Partial<RepoNote> = {}): RepoNote => ({ id, text, at: 1_000, ...patch });
const run = { id: "run-abcd", stage: "fix" as const, agentId: "claude-sonnet", noteRefs: { R1: "a", R2: "b", C1: "c" } };

describe("notes", () => {
	it("reads what to remember, by where it applies and how it was checked", () => {
		expect(parseRemember([
			"repo: Tests run with npm test (checked: ran it, 7 passed)",
			"computer: Use npm.cmd in PowerShell",
			"This computer: Git Bash breaks file:// imports (checked: tried it).",
			"Source lives in src/",
			"ok",
		])).toEqual([
			{ scope: "repo", text: "Tests run with npm test", checked: "ran it, 7 passed" },
			{ scope: "computer", text: "Use npm.cmd in PowerShell", checked: undefined },
			{ scope: "computer", text: "Git Bash breaks file:// imports", checked: "tried it" },
			{ scope: "repo", text: "Source lives in src/", checked: undefined },
		]);
	});

	it("reads how notes held up, in the words agents use", () => {
		expect(parseNoteChecks(["R1 held", "[R2] wrong: the folder exists before the run", "C1 now: use npm.cmd, not npm", "R3 - confirmed", "R4 outdated", "R5 held: npm test printed 7 passed", "C9 is interesting"])).toEqual([
			{ ref: "R1", verdict: "held", text: undefined },
			{ ref: "R2", verdict: "wrong", text: "the folder exists before the run" },
			{ ref: "C1", verdict: "now", text: "use npm.cmd, not npm" },
			{ ref: "R3", verdict: "held", text: undefined },
			{ ref: "R4", verdict: "wrong", text: undefined },
			// What showed it held is evidence, not a correction.
			{ ref: "R5", verdict: "held", text: "npm test printed 7 passed" },
		]);
	});

	it("gives runs pinned notes first, then the ones that held up most, and never flagged ones", () => {
		const repo = [note("old", "Old fact", { at: 1 }), note("held", "Held fact", { confirmations: 3 }), note("pin", "Pinned fact", { pinned: true }), note("bad", "Bad fact", { flagged: { why: "no", at: 2 } })];
		const prompt = notesForPrompt(repo, [note("c", "Computer fact")]);
		expect(prompt.repo.map((entry) => `${entry.ref}=${entry.note.id}`)).toEqual(["R1=pin", "R2=held", "R3=old"]);
		expect(noteRefs(prompt)).toEqual({ R1: "pin", R2: "held", R3: "old", C1: "c" });
		expect(notesSection(prompt).join("\n")).toContain("About this computer (shells, tools, paths):\n- C1: Computer fact");
		expect(notesSection(notesForPrompt([], []))).toEqual([]);
	});

	it("confirms and flags the notes a run checked, holds corrections for a person, and adds what it learnt", () => {
		const book = { repo: [note("a", "Tests run with npm test"), note("b", "The proof folder is missing at the start of a run")], computer: [note("c", "Use npm in PowerShell")] };
		const result = applyNoteReport(book, {
			notes: [], files: [],
			noteChecks: [{ ref: "R1", verdict: "held" }, { ref: "R2", verdict: "wrong", text: "Factory creates it first" }, { ref: "C1", verdict: "now", text: "Use npm.cmd in PowerShell" }, { ref: "R9", verdict: "held" }],
			remember: [{ scope: "repo", text: "The changelog needs the issue number at the end", checked: "CI failed without it" }],
		}, run, 5_000);
		expect(result.repo.find((entry) => entry.id === "a")).toMatchObject({ confirmations: 1, confirmedAt: 5_000 });
		expect(result.repo.find((entry) => entry.id === "b")?.flagged).toEqual({ why: "Factory creates it first", at: 5_000, runId: "run-abcd", stage: "fix", agentId: "claude-sonnet" });
		// A correction doesn't overwrite the note: it waits, with the new wording ready to accept.
		expect(result.computer[0]).toMatchObject({ text: "Use npm in PowerShell", flagged: { why: "It has changed.", proposed: "Use npm.cmd in PowerShell" } });
		expect(result.repo[0]).toMatchObject({ text: "The changelog needs the issue number at the end", checked: "CI failed without it", runId: "run-abcd" });
		expect(result.changes).toEqual(["R1 held", "flagged R2 as wrong", "suggested a correction to C1", "noted something about the repository"]);
	});

	it("treats a reworded note as one that held, and keeps out unchecked notes and ones about code positions", () => {
		const book = { repo: [note("a", "The changelog job fails any line that doesn't end with the issue number")], computer: [] };
		const result = applyNoteReport(book, {
			notes: [], files: [],
			noteChecks: [{ ref: "R1", verdict: "now", text: "The changelog job fails any line that doesn't end with the issue number." }],
			remember: [
				{ scope: "repo", text: "As far as I can tell this is a library with no UI" },
				{ scope: "repo", text: "`src/price.js:3` formats with toFixed(2)" },
				{ scope: "repo", text: "applyDiscount is on line 10 of the cart" },
			],
		}, { ...run, noteRefs: { R1: "a" } }, 5_000);
		expect(result.repo).toHaveLength(1);
		expect(result.repo[0]).toMatchObject({ confirmations: 1 });
		expect(result.repo[0]!.flagged).toBeUndefined();
		expect(result.changes.filter((change) => change.startsWith("left out"))).toHaveLength(3);
	});

	it("counts a note it would add again as a confirmation, not a second note", () => {
		const book = { repo: [note("a", "Run the tests with npm test; there is no lint or typecheck script")], computer: [] };
		const result = applyNoteReport(book, { notes: [], files: [], remember: [{ scope: "repo", text: "There is no lint or typecheck script, run the tests with npm test" }] }, run, 5_000);
		expect(result.repo).toHaveLength(1);
		expect(result.repo[0]!.confirmations).toBe(1);
		expect(noteSimilarity("Tests use node:test", "Deploys go through Vercel")).toBeLessThan(0.2);
	});
});
