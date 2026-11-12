import { describe, expect, it } from "vitest";
import { CHAT_PRIVACY_REVIEW_VERSION, hasReviewedChatPrivacy } from "./privacyReview";

describe("Chat privacy review", () => {
	it.each([{}, { chat_privacy_reviews: null }, { chat_privacy_reviews: [] },
		{ chat_privacy_reviews: { workspace1: "old" } },
		{ chat_privacy_reviews: { workspace2: CHAT_PRIVACY_REVIEW_VERSION } }])(
		"blocks missing, stale and other-workspace confirmations", metadata => {
			expect(hasReviewedChatPrivacy(metadata, "workspace1")).toBe(false);
		});
	it("accepts the current server-owned confirmation for this workspace", () => {
		expect(hasReviewedChatPrivacy({ chat_privacy_reviews: { workspace1: CHAT_PRIVACY_REVIEW_VERSION } }, "workspace1")).toBe(true);
	});
});
