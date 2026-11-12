import { beforeEach, expect, it, vi } from "vitest";
import { updateRoutingSettings } from "./actions";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: vi.fn(), WebApiError: class extends Error {} }));
vi.mock("@/lib/serverFn/actionMiddleware", async () => {
	const { createMiddleware } = await import("@tanstack/react-start");
	return { serverMutation: createMiddleware({ type: "function" }).server(({ next }) => next()), serverAction: createMiddleware({ type: "function" }).server(({ next }) => next()) };
});
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getServerAccountContext).mockResolvedValue({ userId: "user-1", accessToken: "fixture", workspaceId: "workspace-2", obfuscateInfo: null });
});
it("refuses to save an old workspace's draft into the newly selected workspace", async () => {
	await expect(updateRoutingSettings({ data: { expectedWorkspaceId: "workspace-1", mode: "price" } })).resolves.toEqual({ ok: false, error: "Active workspace changed" });
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
});
