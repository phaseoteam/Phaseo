import { beforeEach, expect, it, vi } from "vitest";
import { CHAT_PRIVACY_REVIEW_VERSION } from "./privacyReview";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn() }));
vi.mock("@/auth/requireUser", () => ({ requireUser: mocks.user }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: mocks.from }) }));
import { resolveGatewayKeys } from "./proxy";
beforeEach(() => {
	mocks.user.mockResolvedValue({ id: "user1", appMetadata: {}, userMetadata: {
		chat_privacy_reviews: { workspace1: CHAT_PRIVACY_REVIEW_VERSION },
	} });
	mocks.from.mockReset().mockImplementation((table: string) => {
		const query: any = { select: () => query, eq: () => query,
			maybeSingle: async () => ({ data: { default_workspace_id: "workspace1" }, error: null }),
			order: async () => ({ data: table === "workspace_members" ? [{ workspace_id: "workspace1" }] : [], error: null }) };
		return query;
	});
});
it("blocks direct Chat requests and user-editable forged confirmation before minting keys", async () => {
	const result = await resolveGatewayKeys(new Request("https://example.com/chat"), {} as any, () => {});
	expect(result).toMatchObject({ status: 403, code: "chat_privacy_review_required" });
	expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain("keys");
});
it("lets a current trusted confirmation pass the review gate", async () => {
	mocks.user.mockResolvedValue({ id: "user1", appMetadata: { chat_privacy_reviews: { workspace1: CHAT_PRIVACY_REVIEW_VERSION } } });
	expect(await resolveGatewayKeys(new Request("https://example.com/chat"), {} as any, () => {}))
		.toMatchObject({ code: "chat_key_configuration_missing" });
});
