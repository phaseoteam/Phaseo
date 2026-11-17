import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

const discord = vi.fn<(args: { message: string }) => Promise<void>>();
const slack = vi.fn<(url: string, message: string) => Promise<void>>();

vi.mock("./discord-webhook", () => ({ sendDiscordTextMessage: (args: { message: string }) => discord(args) }));
vi.mock("./slack", () => ({ sendSlackWebhookMessage: (url: string, message: string) => slack(url, message) }));

const { sendPrivateModelDiscoveryNotification } = await import("./private-model-discovery-notifications");

/** An alert long enough to need two messages: 25 providers x 8 long model names. */
function longAlert() {
	const emptyPricing = { enabled: true, executed: true, updatesDetected: 0, providerChanges: [] } as never;
	return {
		modelChanges: Array.from({ length: 25 }, (_, p) => ({
			providerId: `provider-${p}`,
			providerName: `Provider ${p}`,
			added: Array.from({ length: 8 }, (_, i) => `organisation/a-fairly-long-model-name-${p}-${i}`),
			removed: [],
		})) as never,
		pricing: emptyPricing,
		providerApiPricing: emptyPricing,
		pricingTable: { enabled: true, executed: true, updatesDetected: 0, sources: [], errors: [] } as never,
		configuredModelCoverage: { updatesDetected: 0, providerChanges: [] } as never,
	};
}

describe("private alert delivery across destinations", () => {
	beforeEach(() => {
		setupRuntimeFromEnv({
			DISCORD_WEBHOOK_URL: "https://discord.example/webhook",
			MODEL_DISCOVERY_SLACK_WEBHOOK_URL: "https://slack.example/webhook",
		} as never);
		discord.mockReset();
		slack.mockReset();
	});
	afterEach(() => teardownTestRuntime());

	it("fails when Discord gets only the first part and Slack only the second", async () => {
		let discordCalls = 0;
		let slackCalls = 0;
		discord.mockImplementation(async () => {
			discordCalls += 1;
			if (discordCalls > 1) throw new Error("discord down");
		});
		slack.mockImplementation(async () => {
			slackCalls += 1;
			if (slackCalls === 1) throw new Error("slack down");
		});
		await expect(sendPrivateModelDiscoveryNotification(longAlert())).rejects.toThrow(/No destination received every part/);
		expect(discordCalls).toBeGreaterThan(1);
	});

	it("fails when Slack gets only the first part and Discord only the second", async () => {
		let discordCalls = 0;
		let slackCalls = 0;
		discord.mockImplementation(async () => {
			discordCalls += 1;
			if (discordCalls === 1) throw new Error("discord down");
		});
		slack.mockImplementation(async () => {
			slackCalls += 1;
			if (slackCalls > 1) throw new Error("slack down");
		});
		await expect(sendPrivateModelDiscoveryNotification(longAlert())).rejects.toThrow(/No destination received every part/);
	});

	it("falls back to the default review link when the configured one would exhaust the message budget", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			DISCORD_WEBHOOK_URL: "https://discord.example/webhook",
			MODEL_DISCOVERY_REVIEW_URL: `https://review.example/${"x".repeat(1_860)}`,
		} as never);
		discord.mockResolvedValue(undefined);
		const result = await sendPrivateModelDiscoveryNotification(longAlert());
		expect(result.delivered).toBe(true);
		const sent = discord.mock.calls.map(([args]) => args.message);
		for (const message of sent) expect(message.length).toBeLessThanOrEqual(1_900);
		expect(sent.at(-1)).toContain("Review queue: https://phaseo.app/settings/internal/model-discovery");
		expect(sent.join("\n")).toContain("organisation/a-fairly-long-model-name-24-0");
	});

	it("counts delivery when one destination got every part, and reports the other's failure", async () => {
		discord.mockResolvedValue(undefined);
		slack.mockRejectedValue(new Error("slack down"));
		const result = await sendPrivateModelDiscoveryNotification(longAlert());
		expect(result).toMatchObject({ delivered: true, reason: "partial notification delivery", channels: ["Discord"] });
		expect(discord.mock.calls.length).toBeGreaterThan(1);
	});
});
