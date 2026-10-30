import {
	buildAccountLifecycleDiscordPayload,
	maskEmailForWebhook,
	resolveAccountLifecycleDiscordWebhookUrl,
	sendAccountLifecycleDiscordWebhook,
} from "./accountLifecycleDiscord";

describe("account lifecycle Discord webhook helpers", () => {
	const originalSignupWebhookUrl = process.env.DISCORD_SIGNUP_WEBHOOK_URL;

	afterEach(() => {
		if (originalSignupWebhookUrl === undefined) {
			delete process.env.DISCORD_SIGNUP_WEBHOOK_URL;
		} else {
			process.env.DISCORD_SIGNUP_WEBHOOK_URL = originalSignupWebhookUrl;
		}

		jest.restoreAllMocks();
	});

	it("masks the local part of an email for webhook payloads", () => {
		expect(maskEmailForWebhook("daniel@example.com")).toBe("d*****@example.com");
		expect(maskEmailForWebhook(null)).toBe("unknown");
	});

	it("reads the signup webhook env var for lifecycle notifications", () => {
		process.env.DISCORD_SIGNUP_WEBHOOK_URL = "https://discord.example/signup";

		expect(resolveAccountLifecycleDiscordWebhookUrl()).toBe(
			"https://discord.example/signup",
		);
	});

	it("builds a deletion payload with masked email and deletion timestamp", () => {
		expect(
			buildAccountLifecycleDiscordPayload({
				event: "account_deleted",
				userId: "user_123",
				email: "daniel@example.com",
				timestampIso: "2026-06-05T12:00:00.000Z",
			}),
		).toEqual({
			content: [
				"Phaseo account deleted",
				"- event: `account_deleted`",
				"- user_id: `user_123`",
				"- email: `d*****@example.com`",
				"- deleted_at: `2026-06-05T12:00:00.000Z`",
			].join("\n"),
			allowed_mentions: { parse: [] },
		});
	});

	it("sends lifecycle notifications through the signup webhook env var", async () => {
		process.env.DISCORD_SIGNUP_WEBHOOK_URL = "https://discord.example/signup";

		const fetchImpl = jest.fn().mockResolvedValue({
			ok: true,
			status: 204,
			statusText: "No Content",
			text: async () => "",
		});

		await expect(
			sendAccountLifecycleDiscordWebhook(
				{
					event: "account_deleted",
					userId: "user_123",
					email: "daniel@example.com",
					timestampIso: "2026-06-05T12:00:00.000Z",
				},
				{ fetchImpl },
			),
		).resolves.toBe(true);

		expect(fetchImpl).toHaveBeenCalledWith(
			"https://discord.example/signup",
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					content: [
						"Phaseo account deleted",
						"- event: `account_deleted`",
						"- user_id: `user_123`",
						"- email: `d*****@example.com`",
						"- deleted_at: `2026-06-05T12:00:00.000Z`",
					].join("\n"),
					allowed_mentions: { parse: [] },
				}),
			}),
		);
	});

	it("returns false without calling fetch when no lifecycle webhook is configured", async () => {
		delete process.env.DISCORD_SIGNUP_WEBHOOK_URL;

		const fetchImpl = jest.fn();

		await expect(
			sendAccountLifecycleDiscordWebhook(
				{
					event: "signup",
					userId: "user_123",
					email: "daniel@example.com",
					timestampIso: "2026-06-05T12:00:00.000Z",
				},
				{ fetchImpl },
			),
		).resolves.toBe(false);

		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
