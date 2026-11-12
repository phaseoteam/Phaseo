export const CHAT_PRIVACY_REVIEW_VERSION = "2026-10-08";

export function hasReviewedChatPrivacy(metadata: Record<string, unknown>, workspaceId: string): boolean {
	const reviews = metadata.chat_privacy_reviews;
	return !!reviews && typeof reviews === "object" && !Array.isArray(reviews) &&
		(reviews as Record<string, unknown>)[workspaceId] === CHAT_PRIVACY_REVIEW_VERSION;
}
