import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("@/lib/server/currentRequest", () => ({
	currentRequestCookie: vi.fn(),
	setResponseCookie: vi.fn(),
	deleteResponseCookie: vi.fn(),
}));
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({
	getServerAccountContext: vi.fn(),
}));
vi.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: vi.fn() }));

import { currentRequestCookie, deleteResponseCookie, setResponseCookie } from "@/lib/server/currentRequest";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import {
	getWorkspaceIdFromCookie,
	resolveAccessibleWorkspaceIdFromCookie,
} from "./workspaceCookie";

const getServerAccountContextMock = vi.mocked(getServerAccountContext);
const fetchAccountWebApiMock = vi.mocked(fetchAccountWebApi);

describe("workspace cookie resolution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getServerAccountContextMock.mockResolvedValue({
			accessToken: "access-token",
			obfuscateInfo: null,
			workspaceId: null,
		});
		fetchAccountWebApiMock.mockResolvedValue({
			signedIn: true,
			workspaceId: "workspace-1",
		});
		vi.mocked(currentRequestCookie).mockReturnValue(undefined);
	});

	it("does not write a cookie while resolving during a read", async () => {
		expect(await getWorkspaceIdFromCookie()).toBe("workspace-1");

		expect(setResponseCookie).not.toHaveBeenCalled();
		expect(deleteResponseCookie).not.toHaveBeenCalled();
	});

	it("persists the resolved workspace when explicitly requested", async () => {
		expect(
			await resolveAccessibleWorkspaceIdFromCookie({ persistCookie: true }),
		).toBe("workspace-1");

		expect(setResponseCookie).toHaveBeenCalledWith(
			"activeWorkspaceId",
			"workspace-1",
			expect.objectContaining({ httpOnly: true, path: "/" }),
		);
	});
});
