import { fetchPrivateUsage, fetchPrivateUsageOperation } from "./fetchPrivateUsage";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { createClient } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({
	...jest.requireActual("@/lib/web-api/client"), fetchAccountWebApi: jest.fn(),
}));

const scope = { userId: "user-a", workspaceId: "workspace-a" };
const getSession = jest.fn();
beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(createClient).mockReturnValue({ auth: { getSession } } as any);
	getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" }, access_token: "test-token" } } });
	jest.mocked(fetchAccountWebApi).mockResolvedValue({ result: ["private"] });
});

it("uses no-store, an abort signal, and an explicitly scoped workspace", async () => {
	const signal = new AbortController().signal;
	await fetchPrivateUsageOperation("paginatedRequests", [{ pageSize: 50 }], scope, signal);
	const [path, , init] = jest.mocked(fetchAccountWebApi).mock.calls[0];
	expect(path).toBe("/api/account/settings/usage/actions");
	expect(init).toMatchObject({ cache: "no-store", signal, method: "POST" });
	expect(JSON.parse(init!.body as string)).toMatchObject({ workspaceId: "workspace-a", operation: "paginatedRequests" });
});

it.each([null, { user: { id: "user-b" }, access_token: "other" }])("rejects a changed or missing session before sending a request", async (session) => {
	getSession.mockResolvedValue({ data: { session } });
	await expect(fetchPrivateUsage("/api/account/settings/usage/logs", scope, new AbortController().signal)).rejects.toMatchObject({ status: 401 });
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
});

it("does not send a request after query cancellation", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(fetchPrivateUsage("/api/account/settings/usage/logs", scope, controller.signal)).rejects.toThrow();
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
});
