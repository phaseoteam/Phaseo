import {
	createWorkspaceSearchItem,
	fetchWorkspaceSearchItems,
} from "./Search.workspaces";

describe("workspace search", () => {
	it("maps a workspace to its settings destination", () => {
		expect(
			createWorkspaceSearchItem({
				id: "workspace/id",
				name: "Production",
			}),
		).toEqual({
			id: "workspace:workspace/id",
			title: "Production",
			href: "/settings/workspaces/settings",
			workspaceId: "workspace/id",
			persistable: false,
			keywords: ["workspace", "team", "Production"],
		});
	});

	it("fails open without blocking the rest of search", async () => {
		const fetchMock = jest
			.spyOn(global, "fetch")
			.mockResolvedValue(new Response(null, { status: 503 }));

		await expect(fetchWorkspaceSearchItems("/api/search/workspaces")).resolves.toEqual([]);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/search/workspaces",
			expect.objectContaining({ credentials: "same-origin" }),
		);
	});
});
