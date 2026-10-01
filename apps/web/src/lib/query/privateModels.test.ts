import { fetchAuthenticatedPrivateModels } from "./privateModels";
import { fetchAccountWebApi } from "@/lib/web-api/client";

jest.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: jest.fn(),
}));

describe("fetchAuthenticatedPrivateModels", () => {
	it("pins the active workspace to server-side account catalogue requests", async () => {
		const fetchAccountWebApiMock = jest.mocked(fetchAccountWebApi);
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
