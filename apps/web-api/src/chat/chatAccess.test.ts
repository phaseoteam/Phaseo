import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn() }));
vi.mock("@/auth/requireUser", () => ({ requireUser: mocks.user }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: mocks.from }) }));
import { resolveChatWorkspace, resolveGatewayKeys } from "./proxy";
beforeEach(() => {
	mocks.user.mockResolvedValue({ id: "user1", appMetadata: {} });
	mocks.from.mockReset().mockImplementation((table: string) => {
		const query: any = { select: () => query, eq: () => query,
			maybeSingle: async () => ({ data: { default_workspace_id: "workspace1" }, error: null }),
			order: async () => ({ data: table === "workspace_members" ? [{ workspace_id: "workspace1" }] : [], error: null }) };
		return query;
	});
});
it("lets a member who never accepted the old privacy review use Chat", async () => {
	// No key seed in this env, so a request that passes every check stops at configuration.
	expect(await resolveGatewayKeys(new Request("https://example.com/chat"), {} as any, () => {}))
		.toMatchObject({ code: "chat_key_configuration_missing" });
});
it("refuses a header workspace the user can't use instead of using another one", async () => {
	const request = new Request("https://example.com/chat", { headers: { cookie: "activeWorkspaceId=former-workspace" } });
	expect(await resolveChatWorkspace(request, {} as any)).toMatchObject({ status: 409, code: "active_workspace_unavailable" });
	expect(await resolveGatewayKeys(request, {} as any, () => {})).toMatchObject({ status: 409, code: "active_workspace_unavailable" });
	expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain("keys");
});
it("uses the header workspace when the user can use it", async () => {
	const request = new Request("https://example.com/chat", { headers: { cookie: "activeWorkspaceId=workspace1" } });
	expect(await resolveChatWorkspace(request, {} as any)).toMatchObject({ workspaceId: "workspace1" });
});
it("uses the default workspace when none has been picked yet", async () => {
	expect(await resolveChatWorkspace(new Request("https://example.com/chat"), {} as any)).toMatchObject({ workspaceId: "workspace1" });
});
