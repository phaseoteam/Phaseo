import {
	buildWebhookPayload,
	filterUnannouncedModels,
	formatSingleModelEmbed,
	sendDiscordWebhookPayload,
	toAnnouncementKey,
	validateDiscordWebhookUrl,
} from "./internalModelDiscordNotifier";

describe("internal model discord notifier", () => {
	it("builds single-model embed payload with linked org-prefixed title", () => {
		const payload = buildWebhookPayload(
			[
				{
					modelId: "anthropic/claude-mythos-preview",
					modelName: "Claude Mythos Preview",
					modelUrl: "https://phaseo.ai/models/anthropic/claude-mythos-preview",
					creatorName: "Anthropic",
					creatorColor: "#cc785c",
				},
			],
			"1234567890",
			{
				discordUserId: "9876543210",
				nowIso: "2026-04-10T12:00:00.000Z",
			}
		);

		expect(payload.content).toBe("<@&1234567890> <@9876543210>");
		expect(payload.allowed_mentions.roles).toEqual(["1234567890"]);
		expect(payload.allowed_mentions.users).toEqual(["9876543210"]);
		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].title).toBe("Anthropic: Claude Mythos Preview");
		expect(payload.embeds[0].url).toBe(
			"https://phaseo.ai/models/anthropic/claude-mythos-preview"
		);
		expect(payload.embeds[0].description).toContain("Model ID: `anthropic/claude-mythos-preview`");
		expect(payload.embeds[0].description).toContain("[View Model](https://phaseo.ai/models/anthropic/claude-mythos-preview)");
		expect(payload.embeds[0].footer.text).toBe("Phaseo | 10 Apr 2026");
		expect(payload.embeds[0].color).toBe(0xcc785c);
		expect(payload.avatar_url).toBe("https://phaseo.ai/png_logo_light.png");
	});

	it("builds multi-model payload as model cards with one overflow card", () => {
		const models = Array.from({ length: 15 }, (_, index) => ({
			modelId: `openai/model-${index + 1}`,
			modelName: `Model ${index + 1}`,
			modelUrl: `https://phaseo.ai/models/openai/model-${index + 1}`,
			creatorName: "OpenAI",
		}));

		const payload = buildWebhookPayload(models, null, {
			maxModelEmbeds: 3,
			nowIso: "2026-04-10T12:00:00.000Z",
		});

		expect(payload.embeds).toHaveLength(3);
		expect(payload.embeds[0].title).toBe("OpenAI: Model 1");
		expect(payload.embeds[1].title).toBe("OpenAI: Model 2");
		expect(payload.embeds[2].title).toBe("+13 more models");
		expect(payload.embeds[2].description).toContain("[View Models](https://phaseo.ai/models)");
	});

	it("filters duplicate and previously announced models", () => {
		const models = [
			{
				modelId: "voyage/voyage-3",
				modelName: "Voyage 3",
				modelUrl: "https://phaseo.ai/models/voyage/voyage-3",
			},
			{
				modelId: "voyage/voyage-3",
				modelName: "Voyage 3 Duplicate",
				modelUrl: "https://phaseo.ai/models/voyage/voyage-3",
			},
			{
				modelId: "voyage/voyage-4",
				modelName: "Voyage 4",
				modelUrl: "https://phaseo.ai/models/voyage/voyage-4",
			},
		];
		const announced = {
			[toAnnouncementKey(models[0])]: "2026-04-10T11:00:00.000Z",
		};

		const filtered = filterUnannouncedModels(models, announced);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].modelId).toBe("voyage/voyage-4");
	});

	it("retries and throws on webhook failure", async () => {
		const requestMock = jest.fn(async () => {
			return {
				status: 500,
				body: "temporary upstream issue",
			};
		});

		const payload = buildWebhookPayload(
			[
				{
					modelId: "voyage/voyage-4",
					modelName: "Voyage 4",
					modelUrl: "https://phaseo.ai/models/voyage/voyage-4",
				},
			],
			null
		);

		await expect(
			sendDiscordWebhookPayload("https://discord.com/api/webhooks/test/token", payload, {
				requestImpl: requestMock,
				maxAttempts: 2,
				retryDelayMs: 0,
				logger: {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
				},
			})
		).rejects.toThrow(/Discord webhook request failed/);
		expect(requestMock).toHaveBeenCalledTimes(2);
	});

	it("formats a single model embed with expected footer and color", () => {
		const embed = formatSingleModelEmbed(
			{
				modelId: "voyage/voyage-3",
				modelName: "Voyage 3",
				modelUrl: "https://phaseo.ai/models/voyage/voyage-3",
				creatorName: "Voyage",
				creatorColor: "#1A2B3C",
			},
			"2026-04-10T12:00:00.000Z"
		);

		expect(embed.title).toBe("Voyage: Voyage 3");
		expect(embed.description).toContain("voyage/voyage-3");
		expect(embed.footer.text).toBe("Phaseo | 10 Apr 2026");
		expect(embed.color).toBe(0x1a2b3c);
		expect(embed.timestamp).toBeUndefined();
	});

	it("rejects webhook URLs that are not Discord hosts", () => {
		expect(() =>
			validateDiscordWebhookUrl("https://example.com/api/webhooks/123/token")
		).toThrow(/host is not allowed/i);
	});

	it("rejects webhook URLs without Discord webhook path", () => {
		expect(() =>
			validateDiscordWebhookUrl("https://discord.com/api/channels/123/messages")
		).toThrow(/path is invalid/i);
	});

	it("normalizes allowed Discord hosts to a canonical request endpoint", async () => {
		const requestMock = jest.fn(async () => {
			return {
				status: 204,
				body: "",
			};
		});
		const payload = buildWebhookPayload(
			[
				{
					modelId: "voyage/voyage-4",
					modelName: "Voyage 4",
					modelUrl: "https://phaseo.ai/models/voyage/voyage-4",
				},
			],
			null
		);

		await sendDiscordWebhookPayload(
			"https://canary.discordapp.com/api/webhooks/123456/abcdef",
			payload,
			{
				requestImpl: requestMock,
			}
		);

		expect(requestMock).toHaveBeenCalledTimes(1);
		const firstRequestArg = requestMock.mock.calls[0];
		expect(firstRequestArg).toBeDefined();
		if (firstRequestArg) {
			expect((firstRequestArg as unknown as Array<{ path: string }>)[0]).toMatchObject({
				path: "/api/webhooks/123456/abcdef",
			});
		}
	});
});
