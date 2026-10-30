import { resolveDefaultWorkspaceId } from "./defaultWorkspace";

const workspaces = [{ id: "workspace-a" }, { id: "workspace-b" }];

describe("resolveDefaultWorkspaceId", () => {
	it("keeps a stored workspace that is still available", () => {
		expect(resolveDefaultWorkspaceId("workspace-b", workspaces)).toBe(
			"workspace-b",
		);
	});

	it("falls back to the first available workspace for a stale id", () => {
		expect(resolveDefaultWorkspaceId("removed-workspace", workspaces)).toBe(
			"workspace-a",
		);
	});

	it("returns null when no workspaces are available", () => {
		expect(resolveDefaultWorkspaceId(null, [])).toBeNull();
	});
});
