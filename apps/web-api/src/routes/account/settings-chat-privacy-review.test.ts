import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
const mocks = vi.hoisted(() => ({ context: vi.fn(), save: vi.fn(), workspace: vi.fn() }));
vi.mock("./context", () => ({ requireAccountWorkspace: mocks.context }));
vi.mock("@/chat/proxy", () => ({ resolveChatWorkspace: mocks.workspace }));
import { accountChatPrivacyReviewRouter } from "./settings-chat-privacy-review";

describe("Chat privacy confirmation", () => {
	beforeEach(() => {
		mocks.workspace.mockReset().mockResolvedValue({ workspaceId: "workspace1" });
		mocks.save.mockReset().mockResolvedValue({ error: null });
		mocks.context.mockReset().mockResolvedValue({ workspaceId: "workspace1", user: {
			id: "user1", appMetadata: { other: true, chat_privacy_reviews: { workspace2: "old" } },
		}, client: { auth: { admin: { updateUserById: mocks.save } } } });
	});
	it("loads the proxy-resolved workspace rather than a stale or foreign requested workspace", async () => {
		const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { privacy_zdr_only: true }, error: null }) };
		mocks.context.mockResolvedValue({ workspaceId: "workspace1", workspaceName: "Workspace", user: { appMetadata: {} }, client: { from: () => query } });
		const response = await accountChatPrivacyReviewRouter.request("https://example.com/privacy/review?workspaceId=foreign", {}, {} as any);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ workspaceId: "workspace1", reviewed: false });
		expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace1" }));
	});
	function confirm(body: unknown) {
		return accountChatPrivacyReviewRouter.request("https://example.com/privacy/review", {
			method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
		}, {} as any);
	}
	it.each([{ accepted: false, version: CHAT_PRIVACY_REVIEW_VERSION }, { accepted: true, version: "old" }, {}])(
		"requires explicit current-version acceptance", async body => {
			expect((await confirm(body)).status).toBe(400);
			expect(mocks.save).not.toHaveBeenCalled();
		});
	it("denies confirmation outside an authorized workspace", async () => {
		mocks.context.mockResolvedValue(null);
		expect((await confirm({ accepted: true, version: CHAT_PRIVACY_REVIEW_VERSION, workspaceId: "foreign" })).status).toBe(403);
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("saves only the authenticated user's authorized workspace and preserves metadata", async () => {
		expect((await confirm({ accepted: true, version: CHAT_PRIVACY_REVIEW_VERSION, workspaceId: "workspace1", userId: "forged" })).status).toBe(200);
		expect(mocks.save).toHaveBeenCalledWith("user1", { app_metadata: { other: true,
			chat_privacy_reviews: { workspace2: "old", workspace1: CHAT_PRIVACY_REVIEW_VERSION } } });
	});
	it("does not confirm success when persistence fails", async () => {
		mocks.save.mockResolvedValue({ error: { message: "unavailable" } });
		expect((await confirm({ accepted: true, version: CHAT_PRIVACY_REVIEW_VERSION })).status).toBe(503);
	});
});
