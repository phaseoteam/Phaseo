import { describe, expect, it } from "vitest";
import { branchPrefixProblem, defaultSourceControlPreferences, normalizeBranchPrefix, preferenceLines, validateSourceControlPreferences } from "./sourceControlPreferences";

describe("source control preferences", () => {
	it("fills missing fields with defaults, so older preferences load", () => {
		expect(validateSourceControlPreferences(undefined)).toEqual(defaultSourceControlPreferences);
		expect(validateSourceControlPreferences({})).toEqual(defaultSourceControlPreferences);
		expect(validateSourceControlPreferences({ branchPrefix: "team/" })).toEqual({ ...defaultSourceControlPreferences, branchPrefix: "team" });
		expect(defaultSourceControlPreferences).toMatchObject({ worktreeDirectory: null, branchNaming: "static", branchPrefix: "phaseo", submodules: "recursive", addProjectDirectory: null, followPullRequestTemplate: true, gitModel: null, reviewGuideModel: null });
	});

	it("keeps valid values", () => {
		const value = { worktreeDirectory: "D:\\worktrees", branchNaming: "custom", branchPrefix: "", branchInstructions: "Use the issue ID.", submodules: "top-level", addProjectDirectory: "/home/me/code", titleInstructions: "Short.", writingInstructions: "Conventional Commits.", reviewGuideInstructions: "Interfaces first.", followPullRequestTemplate: false, gitModel: "openai/gpt-6-mini", reviewGuideModel: "anthropic/claude-opus" };
		expect(validateSourceControlPreferences(value)).toEqual(value);
		expect(validateSourceControlPreferences({ worktreeDirectory: "\\\\server\\share\\worktrees" }).worktreeDirectory).toBe("\\\\server\\share\\worktrees");
	});

	it("rejects invalid values with a readable message", () => {
		expect(() => validateSourceControlPreferences(null)).toThrow("Invalid sourceControl");
		expect(() => validateSourceControlPreferences([])).toThrow("Invalid sourceControl");
		expect(() => validateSourceControlPreferences({ worktreeDirectory: "relative/folder" })).toThrow("full folder path for worktrees");
		expect(() => validateSourceControlPreferences({ addProjectDirectory: "C:\\code\nx" })).toThrow("Add project");
		expect(() => validateSourceControlPreferences({ worktreeDirectory: "" })).toThrow("full folder path");
		expect(() => validateSourceControlPreferences({ branchNaming: "random" })).toThrow("branches are named");
		expect(() => validateSourceControlPreferences({ submodules: "all" })).toThrow("submodules");
		expect(() => validateSourceControlPreferences({ branchPrefix: "../escape" })).toThrow("branch prefix");
		expect(() => validateSourceControlPreferences({ branchPrefix: 3 })).toThrow("Invalid branch prefix");
		expect(() => validateSourceControlPreferences({ writingInstructions: "x".repeat(4001) })).toThrow("4,000 characters");
		expect(() => validateSourceControlPreferences({ titleInstructions: null })).toThrow("chat title instructions");
		expect(() => validateSourceControlPreferences({ followPullRequestTemplate: "yes" })).toThrow("template");
		expect(() => validateSourceControlPreferences({ gitModel: " " })).toThrow("commits and pull requests");
		expect(() => validateSourceControlPreferences({ reviewGuideModel: "a\u0001b" })).toThrow("review guides");
	});
});

describe("branch prefixes", () => {
	it("accepts safe Git ref prefixes, including none", () => {
		for (const value of ["", "phaseo", "phaseo/", "team/db", "feat.v2", "my_team-1"]) expect(branchPrefixProblem(value)).toBeUndefined();
		expect(normalizeBranchPrefix(" team/db// ")).toBe("team/db");
	});

	it("refuses what Git would reject or misread", () => {
		for (const value of ["-x", ".hidden", "a..b", "a b", "a~1", "a^", "a:b", "a?", "a*", "a[", "a\\b", "x.lock", "x.", "a//b", "@{x}", "a".repeat(61)]) expect(branchPrefixProblem(value), value).toBeTruthy();
	});
});

describe("preference lines", () => {
	it("adds the person's instructions only when there are some", () => {
		expect(preferenceLines("  ")).toEqual([]);
		expect(preferenceLines(undefined)).toEqual([]);
		expect(preferenceLines(" Keep it short. ").join("\n")).toContain("<preferences>\nKeep it short.\n</preferences>");
	});
});
