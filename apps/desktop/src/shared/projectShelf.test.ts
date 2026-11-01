import { describe, expect, it } from "vitest";
import { isProjectArchived, pickerProjects, projectScopes } from "./projectShelf";
import { validateCommand } from "./workspace";

describe("project shelf", () => {
	const projects = [{ id: "a" }, { id: "b", pinned: true }, { id: "c", archived: true }, { id: "c-tree", worktree: { sourceProjectId: "c", branch: "x", baseCommit: "y" } }, { id: "d", pinned: true }];
	it("puts pinned projects first and leaves archived ones out, unless one is already chosen", () => {
		expect(pickerProjects(projects).map(project => project.id)).toEqual(["b", "d", "a"]);
		expect(pickerProjects(projects, "c").map(project => project.id)).toEqual(["b", "d", "a", "c"]);
		expect(isProjectArchived(projects[3], projects)).toBe(true);
	});
	it("reads the filter from a list or an older single id", () => {
		expect(projectScopes("a")).toEqual(["a"]);
		expect(projectScopes("")).toEqual([]);
		expect(projectScopes(["a", "a", 3, "", "b"])).toEqual(["a", "b"]);
		expect(projectScopes(null)).toEqual([]);
	});
	it("accepts project pin and archive changes, and nothing else", () => {
		expect(validateCommand({ type: "organize-project", id: "a", pinned: true })).toEqual({ type: "organize-project", id: "a", pinned: true });
		expect(() => validateCommand({ type: "organize-project", id: "a" })).toThrow();
		expect(() => validateCommand({ type: "organize-project", id: "a", archived: "yes" })).toThrow();
	});
});
