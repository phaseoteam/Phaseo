import { describe, it, expect, vi } from "vitest";
import { fetchAuthenticatedPrivateModels } from "./privateModels";
import { fetchAccountWebApi } from "@/lib/web-api/client";

vi.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: vi.fn(),
}));

describe("fetchAuthenticatedPrivateModels", () => {
	it("pins the active workspace to server-side account catalogue requests", async () => {
		const fetchAccountWebApiMock = vi.mocked(fetchAccountWebApi);
		fetchAccountWebApiMock.mockResolvedValue({
			private_catalogue: true,
			models: [],
		});

		await fetchAuthenticatedPrivateModels("page", {
			accessToken: "session-token",
			workspaceId: "workspace-1",
		});

		expect(fetchAccountWebApiMock.mock.calls.map(([path]) => path)).toEqual([
			"/api/account/private-models/catalog?shape=page&workspaceId=workspace-1",
			"/api/account/private-models/catalog?shape=page&workspaceId=workspace-1&scope=admin",
		]);
	});
});
