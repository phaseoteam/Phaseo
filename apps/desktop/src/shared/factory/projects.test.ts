import { describe, expect, it } from "vitest";
import { isFactoryWorktree } from "./projects";

const worktree = { sourceProjectId: "p1", branch: "factory/12-fix", baseCommit: "abc" };

describe("isFactoryWorktree", () => {
	it("picks Factory's worktree projects on Windows and POSIX paths", () => {
		expect(isFactoryWorktree({ directory: ["C:", "Users", "me", "AppData", "Roaming", "Phaseo", "workspace", "factory", "worktrees", "owner-name-12"].join("\\"), worktree })).toBe(true);
		expect(isFactoryWorktree({ directory: "/home/me/.config/Phaseo/workspace/factory/worktrees/owner-name-12", worktree })).toBe(true);
	});
	it("leaves other projects and worktrees alone", () => {
		expect(isFactoryWorktree({ directory: "/home/me/.config/Phaseo/workspace/factory/worktrees/owner-name-12" })).toBe(false);
		expect(isFactoryWorktree({ directory: "/home/me/code/app-feature", worktree })).toBe(false);
		expect(isFactoryWorktree({ directory: "/home/me/code/factory" })).toBe(false);
	});
});
