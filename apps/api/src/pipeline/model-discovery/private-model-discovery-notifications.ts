import { sendDiscordTextMessage } from "./discord-webhook";
import {
	buildModelDiscordSection,
	buildPricingDiscordSection,
	buildPricingTableDiscordSection,
	buildProviderApiPricingDiscordSection,
	hasDiscordNotifiableChanges,
	readBindingEnv,
	type ConfiguredModelCoverageMonitorSummary,
	type PricingMonitorSummary,
	type PricingTableMonitorSummary,
	type ProviderApiPricingMonitorSummary,
	type ProviderChange,
} from "./helpers";
import { sendSlackWebhookMessage } from "./slack";

const PRIVATE_MODEL_DISCOVERY_USERNAME = "Phaseo Private Model Discovery";
const PRIVATE_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_dark.png";
const DEFAULT_MODEL_DISCOVERY_REVIEW_URL = "https://phaseo.app/settings/internal/model-discovery";
const MAX_DISCORD_MESSAGE_LENGTH = 1_900;

function appendReviewQueueLink(message: string): string {
	const reviewUrl = readBindingEnv(["MODEL_DISCOVERY_REVIEW_URL"]) ?? DEFAULT_MODEL_DISCOVERY_REVIEW_URL;
	const suffix = `\n\nReview queue: ${reviewUrl}`;
	const available = Math.max(0, MAX_DISCORD_MESSAGE_LENGTH - suffix.length);
	const base = message.length <= available ? message : `${message.slice(0, Math.max(0, available - 16))}\n...[truncated]`;
	return `${base}${suffix}`;
}

export type PrivateModelDiscoveryNotification = {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	pricingTable: PricingTableMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
};

export function buildPrivateModelDiscoveryMessage(args: PrivateModelDiscoveryNotification): string {
	const sections: string[] = [];
	const modelSection = buildModelDiscordSection(args.modelChanges);
	const pricingSection = buildPricingDiscordSection(args.pricing);
	const providerApiPricingSection = buildProviderApiPricingDiscordSection(args.providerApiPricing);
	const pricingTableSection = buildPricingTableDiscordSection(args.pricingTable);
	if (modelSection) sections.push(modelSection);
	if (pricingSection) sections.push(pricingSection);
	if (providerApiPricingSection) sections.push(providerApiPricingSection);
	if (pricingTableSection) sections.push(pricingTableSection);
	const text = sections.join("\n\n").trim();
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

export async function computePrivateModelDiscoveryFingerprint(
	args: PrivateModelDiscoveryNotification,
): Promise<string | null> {
	const message = buildPrivateModelDiscoveryMessage(args).trim();
	if (!message) return null;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sendPrivateModelDiscoveryNotification(
	args: PrivateModelDiscoveryNotification,
): Promise<{ delivered: boolean; skipped: boolean; reason?: string | null; error?: string | null }> {
	if (!hasDiscordNotifiableChanges(args)) {
		return { delivered: false, skipped: true, reason: "no notifiable changes" };
	}
	const discordWebhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	const slackWebhookUrl = readBindingEnv(["MODEL_DISCOVERY_SLACK_WEBHOOK_URL"]);
	if (!discordWebhookUrl && !slackWebhookUrl) {
		return { delivered: false, skipped: true, reason: "missing Discord and Slack webhook URLs" };
	}

	const message = appendReviewQueueLink(buildPrivateModelDiscoveryMessage(args));
	if (!message.trim()) {
		return { delivered: false, skipped: true, reason: "empty Discord message" };
	}

	const failures: string[] = [];
	const deliveredChannels: string[] = [];
	if (discordWebhookUrl) {
		try {
			await sendDiscordTextMessage({
				webhookUrl: discordWebhookUrl,
				message,
				roleId: readBindingEnv(["DISCORD_ROLE_ID"]),
				userId: readBindingEnv(["DISCORD_USER_ID"]),
				username: PRIVATE_MODEL_DISCOVERY_USERNAME,
				avatarUrl: PRIVATE_MODEL_DISCOVERY_AVATAR_URL,
			});
			deliveredChannels.push("Discord");
		} catch (error) {
			failures.push(`Discord: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (slackWebhookUrl) {
		try {
			await sendSlackWebhookMessage(slackWebhookUrl, message);
			deliveredChannels.push("Slack");
		} catch (error) {
			failures.push(`Slack: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (failures.length > 0 && deliveredChannels.length === 0) throw new Error(failures.join("; "));
	if (failures.length > 0) {
		const error = failures.join("; ");
		console.warn("[model-discovery] Partial notification delivery (" + deliveredChannels.join(", ") + "): " + error);
		return { delivered: true, skipped: false, reason: "partial notification delivery", error };
	}
	return { delivered: true, skipped: false };
}
