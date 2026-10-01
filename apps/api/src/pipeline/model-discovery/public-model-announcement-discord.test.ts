import { describe, expect, it } from "vitest";
import { buildPublicModelAnnouncementPayload } from "./public-model-announcement-discord";

describe("model discovery Discord payloads", () => {
	it("keeps the review link in the message and attaches model OG images", () => {
		const payload = buildPublicModelAnnouncementPayload(
			[
				{
					modelId: "acme/atlas-1",
					modelName: "Atlas 1",
					modelUrl: "https://phaseo.app/models/acme/atlas-1",
					imageUrl: "https://phaseo.app/og/models/acme/atlas-1",
				},
			],
			null,
			{
				includeMentions: false,
				message: "Review queue: https://phaseo.app/settings/internal/model-discovery",
				nowIso: "2026-09-16T12:00:00.000Z",
			},
		);

		expect(payload.content).toContain("Review queue:");
		expect(payload.embeds?.[0]?.image).toEqual({
				url: "https://phaseo.app/og/models/acme/atlas-1",
		});
	});

	it("can build a public announcement without role or user mentions", () => {
		const payload = buildPublicModelAnnouncementPayload(
			[
				{
					modelId: "acme/atlas-1",
					modelName: "Atlas 1",
					modelUrl: "https://phaseo.app/models/acme/atlas-1",
				},
			],
			"role-that-must-not-be-mentioned",
			{
				includeMentions: false,
				message: "Test announcement only.",
			},
		);

		expect(payload.content).toBe("Test announcement only.");
		expect(payload.allowed_mentions).toEqual({ parse: [], roles: [], users: [] });
	});
});
