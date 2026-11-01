import { describe, expect, it } from "vitest";
import { branchFromMessage, generatedBranchName, isTemporaryWorktreeBranch, sanitizeBranchFragment, temporaryWorktreeBranch, uniqueBranchName, validateWorktreeChatRequest } from "./worktreeChat";

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
