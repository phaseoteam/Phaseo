jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({
	getServerAccountContext: jest.fn(),
}));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

import { cookies } from "next/headers";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import {
	getWorkspaceIdFromCookie,
	resolveAccessibleWorkspaceIdFromCookie,
} from "./workspaceCookie";

const cookiesMock = jest.mocked(cookies);
const getServerAccountContextMock = jest.mocked(getServerAccountContext);
const fetchAccountWebApiMock = jest.mocked(fetchAccountWebApi);

describe("workspace cookie resolution", () => {
	const cookieStore = {
		get: jest.fn(),
		set: jest.fn(),
		delete: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		cookiesMock.mockResolvedValue(cookieStore as never);
		getServerAccountContextMock.mockResolvedValue({
			accessToken: "access-token",
			obfuscateInfo: null,
			workspaceId: null,
		});
		fetchAccountWebApiMock.mockResolvedValue({
			signedIn: true,
			workspaceId: "workspace-1",
		});
		cookieStore.get.mockReturnValue(undefined);
	});

	it("does not write a cookie while resolving during a read", async () => {
		expect(await getWorkspaceIdFromCookie()).toBe("workspace-1");

		expect(cookieStore.set).not.toHaveBeenCalled();
		expect(cookieStore.delete).not.toHaveBeenCalled();
	});

	it("persists the resolved workspace when explicitly requested", async () => {
		expect(
			await resolveAccessibleWorkspaceIdFromCookie({ persistCookie: true }),
		).toBe("workspace-1");

		expect(cookieStore.set).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "activeWorkspaceId",
				value: "workspace-1",
			}),
		);
	});
});
