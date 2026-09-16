import { describe, expect, it } from "vitest";
import { buildInternalModelWebhookPayload } from "./discord";

describe("model discovery Discord payloads", () => {
	it("keeps the review link in the message and attaches model OG images", () => {
		const payload = buildInternalModelWebhookPayload(
			[
				{
					modelId: "acme/atlas-1",
					modelName: "Atlas 1",
					modelUrl: "https://phaseo.app/models/acme/atlas-1",
					imageUrl: "https://phaseo.app/og/models/acme/atlas-1?discovery=1",
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
			url: "https://phaseo.app/og/models/acme/atlas-1?discovery=1",
		});
	});
});
