import {
	buildBillingDiscordPayload,
	resolveBillingDiscordWebhookUrl,
	sendBillingDiscordWebhook,
} from "./billingDiscord";

describe("billing Discord webhook helpers", () => {
	const originalBillingWebhookUrl = process.env.DISCORD_BILLING_WEBHOOK_URL;

	afterEach(() => {
		if (originalBillingWebhookUrl === undefined) {
			delete process.env.DISCORD_BILLING_WEBHOOK_URL;
		} else {
			process.env.DISCORD_BILLING_WEBHOOK_URL = originalBillingWebhookUrl;
		}

		jest.restoreAllMocks();
	});

	it("reads the billing webhook env var", () => {
		process.env.DISCORD_BILLING_WEBHOOK_URL = "https://discord.example/billing";

		expect(resolveBillingDiscordWebhookUrl()).toBe(
			"https://discord.example/billing",
		);
	});

	it("builds a checkout-started payload with masked email", () => {
		expect(
			buildBillingDiscordPayload({
				event: "checkout_started",
				email: "daniel@example.com",
				payload: {
					workspaceId: "workspace_123",
					userId: "user_123",
					firstName: "Daniel",
					checkoutSessionId: "cs_test_123",
					checkoutKind: "oneoff",
					currency: "usd",
					amountPence: 2625,
					startedAtIso: "2026-06-06T10:00:00.000Z",
				},
			}),
		).toEqual({
			content: [
				"AI Stats checkout started",
				"- event: `checkout_started`",
				"- workspace_id: `workspace_123`",
				"- user_id: `user_123`",
				"- email: `d*****@example.com`",
				"- checkout_session_id: `cs_test_123`",
				"- checkout_kind: `oneoff`",
				"- amount: `26.25 usd`",
				"- started_at: `2026-06-06T10:00:00.000Z`",
			].join("\n"),
			allowed_mentions: { parse: [] },
		});
	});

	it("builds a purchase payload and tolerates a missing checkout session id", () => {
		expect(
			buildBillingDiscordPayload({
				event: "credits_purchased",
				email: null,
				payload: {
					workspaceId: "workspace_123",
					paymentIntentId: "pi_123",
					firstName: "Daniel",
					currency: "usd",
					amountNanos: 25_000_000_000,
					kind: "top_up_one_off",
					creditedAtIso: "2026-06-06T10:05:00.000Z",
				},
			}),
		).toEqual({
			content: [
				"AI Stats credits purchased",
				"- event: `credits_purchased`",
				"- workspace_id: `workspace_123`",
				"- payment_intent_id: `pi_123`",
				"- email: `unknown`",
				"- checkout_session_id: `unknown`",
				"- purchase_kind: `top_up_one_off`",
				"- amount: `25.00 usd`",
				"- credited_at: `2026-06-06T10:05:00.000Z`",
			].join("\n"),
			allowed_mentions: { parse: [] },
		});
	});

	it("sends checkout-started notifications through the billing webhook env var", async () => {
		process.env.DISCORD_BILLING_WEBHOOK_URL =
			"https://discord.example/billing";

		const fetchImpl = jest.fn().mockResolvedValue({
			ok: true,
			status: 204,
			statusText: "No Content",
			text: async () => "",
		});

		await expect(
			sendBillingDiscordWebhook(
				{
					event: "checkout_started",
					email: "daniel@example.com",
					payload: {
						workspaceId: "workspace_123",
						userId: "user_123",
						firstName: "Daniel",
						checkoutSessionId: "cs_test_123",
						checkoutKind: "pay_and_save",
						currency: "usd",
						amountPence: 2625,
						startedAtIso: "2026-06-06T10:00:00.000Z",
					},
				},
				{ fetchImpl },
			),
		).resolves.toBe(true);

		expect(fetchImpl).toHaveBeenCalledWith(
			"https://discord.example/billing",
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					content: [
						"AI Stats checkout started",
						"- event: `checkout_started`",
						"- workspace_id: `workspace_123`",
						"- user_id: `user_123`",
						"- email: `d*****@example.com`",
						"- checkout_session_id: `cs_test_123`",
						"- checkout_kind: `pay_and_save`",
						"- amount: `26.25 usd`",
						"- started_at: `2026-06-06T10:00:00.000Z`",
					].join("\n"),
					allowed_mentions: { parse: [] },
				}),
			}),
		);
	});

	it("returns false without calling fetch when no billing webhook is configured", async () => {
		delete process.env.DISCORD_BILLING_WEBHOOK_URL;

		const fetchImpl = jest.fn();

		await expect(
			sendBillingDiscordWebhook(
				{
					event: "credits_purchased",
					email: "daniel@example.com",
					payload: {
						workspaceId: "workspace_123",
						paymentIntentId: "pi_123",
						firstName: "Daniel",
						checkoutSessionId: "cs_test_123",
						currency: "usd",
						amountNanos: 25_000_000_000,
						kind: "top_up",
						creditedAtIso: "2026-06-06T10:05:00.000Z",
					},
				},
				{ fetchImpl },
			),
		).resolves.toBe(false);

		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
