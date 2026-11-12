import { describe, expect, it } from "vitest";
import { branchFromMessage, branchNamePrompt, generatedBranchName, isTemporaryWorktreeBranch, sanitizeBranchFragment, temporaryWorktreeBranch, uniqueBranchName, validateWorktreeChatRequest } from "./worktreeChat";

describe("worktree chat branches", () => {
	it("sanitises branch name fragments", () => {
		expect(sanitizeBranchFragment("  Fix the Login error!! ")).toBe("fix-the-login-error");
		expect(sanitizeBranchFragment("'feat/Add search'")).toBe("feat/add-search");
		expect(sanitizeBranchFragment("...")).toBe("update");
		expect(sanitizeBranchFragment("a".repeat(80))).toHaveLength(64);
	});

	it("starts on a temporary branch and names the real one under the prefix", () => {
		const temporary = temporaryWorktreeBranch("ABCDEF0123456789");
		expect(temporary).toBe("phaseo/abcdef01");
		expect(isTemporaryWorktreeBranch(temporary)).toBe(true);
		expect(isTemporaryWorktreeBranch("phaseo/fix-login")).toBe(false);
		expect(generatedBranchName("Fix login error")).toBe("phaseo/fix-login-error");
		expect(generatedBranchName("phaseo/fix-login")).toBe("phaseo/fix-login");
	});

	it("names a branch from the first words of the message without a title model", () => {
		expect(branchFromMessage("Add dark mode to the settings page, please, and check @src/app.tsx")).toBe("phaseo/add-dark-mode-to-the-settings");
		expect(branchFromMessage("   ")).toBe("phaseo/update");
	});

	it("names branches with the chosen prefix and naming mode", () => {
		const naming = (branchNaming: "static" | "semantic" | "custom", branchPrefix = "phaseo") => ({ branchNaming, branchPrefix, branchInstructions: "Use the issue ID." });
		expect(generatedBranchName("Fix login", naming("static", "team/db"))).toBe("team/db/fix-login");
		expect(generatedBranchName("team/db/fix-login", naming("static", "team/db"))).toBe("team/db/fix-login");
		expect(generatedBranchName("Fix login", naming("static", ""))).toBe("fix-login");
		expect(generatedBranchName("feat/Add search", naming("semantic"))).toBe("feat/add-search");
		expect(generatedBranchName("db/PHA-12-fix", naming("custom"))).toBe("db/PHA-12-fix");
		// Without a model, the first words go under the prefix whatever the mode.
		expect(branchFromMessage("Add search", naming("semantic", "team"))).toBe("team/add-search");
		expect(branchFromMessage("Add search", naming("custom", ""))).toBe("add-search");
		expect(temporaryWorktreeBranch("abcdef0123", "team/db")).toBe("team/db/abcdef01");
		expect(isTemporaryWorktreeBranch("team/db/abcdef01", "team/db")).toBe(true);
		expect(temporaryWorktreeBranch("abcdef0123", "")).toBe("worktree-abcdef01");
		expect(isTemporaryWorktreeBranch("worktree-abcdef01", "")).toBe(true);
	});

	it("asks for the branch name each naming mode needs", () => {
		const naming = (branchNaming: "static" | "semantic" | "custom") => ({ branchNaming, branchPrefix: "phaseo", branchInstructions: "Start with db/." });
		expect(branchNamePrompt("Fix login").system).toContain("without a prefix or namespace");
		expect(branchNamePrompt("Fix login", naming("semantic")).system).toContain("feat/add-search");
		const custom = branchNamePrompt("Fix login", naming("custom")).system;
		expect(custom).toContain("complete branch name"); expect(custom).toContain("<preferences>\nStart with db/.\n</preferences>");
		expect(branchNamePrompt("Fix login", naming("static")).system).not.toContain("Start with db/.");
	});

	it("adds a suffix until the name is free", () => {
		expect(uniqueBranchName(["main"], "phaseo/fix-login")).toBe("phaseo/fix-login");
		expect(uniqueBranchName(["phaseo/fix-login", "phaseo/fix-login-2"], "phaseo/fix-login")).toBe("phaseo/fix-login-3");
		// A branch named like the folder blocks refs under it; refs under the last part block it too.
		expect(uniqueBranchName(["phaseo"], "phaseo/fix-login")).toBe("phaseo-2/fix-login");
		expect(uniqueBranchName(["phaseo/fix-login/old"], "phaseo/fix-login")).toBe("phaseo/fix-login-2");
	});

	it("validates requests", () => {
		expect(validateWorktreeChatRequest({ projectId: "p", base: "main", text: "Hi" })).toEqual({ projectId: "p", base: "main", text: "Hi" });
		expect(() => validateWorktreeChatRequest({ projectId: "p", base: "--force", text: "" })).toThrow("base branch");
		expect(() => validateWorktreeChatRequest({ base: "main", text: "" })).toThrow("project");
	});
});
