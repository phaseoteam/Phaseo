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
import { buildT3ModelDiscoveryEvent, forwardToT3Webhook } from "./t3-webhook";
import {
	buildVeniceChangelogDiscordSection,
	buildVeniceChangelogMessages,
	splitLinesIntoMessages,
	type VeniceChangelogMonitorSummary,
} from "./venice-changelog";

const PRIVATE_MODEL_DISCOVERY_USERNAME = "Phaseo Private Model Discovery";
const PRIVATE_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_dark.png";
const DEFAULT_MODEL_DISCOVERY_REVIEW_URL = "https://phaseo.app/settings/internal/model-discovery";
const MAX_DISCORD_MESSAGE_LENGTH = 1_900;

export type PrivateModelDiscoveryNotification = {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	pricingTable: PricingTableMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
	/** Hourly Venice changelog lifecycle check; absent on runs that did not check it. */
	veniceChangelog?: VeniceChangelogMonitorSummary;
};

/** The main alert's sections in full, before any truncation. The Venice changelog is sent separately. */
function buildPrivateModelDiscoveryText(args: PrivateModelDiscoveryNotification): string {
	const sections: string[] = [];
	const modelSection = buildModelDiscordSection(args.modelChanges);
	const pricingSection = buildPricingDiscordSection(args.pricing);
	const providerApiPricingSection = buildProviderApiPricingDiscordSection(args.providerApiPricing);
	const pricingTableSection = buildPricingTableDiscordSection(args.pricingTable);
	if (modelSection) sections.push(modelSection);
	if (pricingSection) sections.push(pricingSection);
	if (providerApiPricingSection) sections.push(providerApiPricingSection);
	if (pricingTableSection) sections.push(pricingTableSection);
	return sections.join("\n\n").trim();
}

/** Single-message preview of the main alert, cut at the chat limit. Delivery uses the split messages below. */
export function buildPrivateModelDiscoveryMessage(args: PrivateModelDiscoveryNotification): string {
	const text = buildPrivateModelDiscoveryText(args);
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

/** A configured review URL longer than this would crowd out the alert, so the default link is used instead. */
const MAX_REVIEW_URL_LENGTH = 300;

function reviewQueueSuffix(): string {
	const configured = readBindingEnv(["MODEL_DISCOVERY_REVIEW_URL"]);
	const reviewUrl = configured && configured.length <= MAX_REVIEW_URL_LENGTH ? configured : DEFAULT_MODEL_DISCOVERY_REVIEW_URL;
	return `\n\nReview queue: ${reviewUrl}`;
}

/**
 * The main alert as one or more messages, split on lines with nothing truncated, the review-queue link on
 * the last part. Pricing-page state is saved after delivery, so every change it records must be shown.
 */
export function buildPrivateModelDiscoveryMessages(args: PrivateModelDiscoveryNotification): string[] {
	const text = buildPrivateModelDiscoveryText(args);
	if (!text) return [];
	const suffix = reviewQueueSuffix();
	const parts = splitLinesIntoMessages(text.split("\n"), MAX_DISCORD_MESSAGE_LENGTH - suffix.length);
	parts[parts.length - 1] = `${parts[parts.length - 1]}${suffix}`;
	return parts;
}

/**
 * Venice changelog actions are delivered in their own messages, split on whole lines, so they are never cut by
 * the main alert's size and every entry recorded as seen was named in a delivered message.
 */
export function buildPrivateVeniceChangelogMessages(args: PrivateModelDiscoveryNotification): string[] {
	return args.veniceChangelog ? buildVeniceChangelogMessages(args.veniceChangelog, MAX_DISCORD_MESSAGE_LENGTH) : [];
}

/** The whole alert, main sections plus Venice lines, untruncated. */
export function buildFullPrivateAlertText(args: PrivateModelDiscoveryNotification): string {
	const veniceSection = args.veniceChangelog ? buildVeniceChangelogDiscordSection(args.veniceChangelog) : "";
	return [buildPrivateModelDiscoveryText(args), veniceSection].filter(Boolean).join("\n\n").trim();
}

/**
 * Duplicate-delivery key. It hashes the full, untruncated content (main sections and Venice lines), so a
 * change past the truncation point, or a new Venice entry alongside an unchanged main alert, still counts.
 */
export async function computePrivateModelDiscoveryFingerprint(
	args: PrivateModelDiscoveryNotification,
): Promise<string | null> {
	const content = buildFullPrivateAlertText(args);
	if (!content) return null;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PrivateDeliveryResult = {
	delivered: boolean;
	skipped: boolean;
	reason?: string | null;
	error?: string | null;
	/** Destinations that received this message. */
	channels?: string[];
};

export type PrivateNotificationContext = { runId?: string | null; source?: string | null };

export async function sendPrivateModelDiscoveryNotification(
	args: PrivateModelDiscoveryNotification,
	context: PrivateNotificationContext = {},
): Promise<PrivateDeliveryResult> {
	const result = await deliverPrivateModelDiscoveryAlert(args);
	// Forward only once the alert is delivered: an undelivered alert is re-sent next sweep, and T3 should see it once.
	if (result.delivered && !result.skipped) {
		await forwardToT3Webhook(
			buildT3ModelDiscoveryEvent({
				event: "model_discovery.changes",
				id: await computePrivateModelDiscoveryFingerprint(args),
				runId: context.runId,
				source: context.source,
				text: buildFullPrivateAlertText(args),
				data: args,
			}),
		);
	}
	return result;
}

async function deliverPrivateModelDiscoveryAlert(args: PrivateModelDiscoveryNotification): Promise<PrivateDeliveryResult> {
	if (!hasDiscordNotifiableChanges(args)) {
		return { delivered: false, skipped: true, reason: "no notifiable changes" };
	}
	const results: PrivateDeliveryResult[] = [];
	// A part that fails everywhere throws, so the run defers saving pricing-page and changelog state and
	// reports the changes again next time.
	for (const message of [...buildPrivateModelDiscoveryMessages(args), ...buildPrivateVeniceChangelogMessages(args)]) {
		results.push(await deliverPrivateModelDiscoveryMessage(message));
	}
	if (results.length === 0) return { delivered: false, skipped: true, reason: "empty Discord message" };
	const notDelivered = results.find((result) => !result.delivered);
	if (notDelivered) return notDelivered;
	// At least one destination must hold the whole alert: Discord receiving part 1 and Slack part 2 is not delivery.
	const complete = results
		.map((result) => new Set(result.channels ?? []))
		.reduce((common, channels) => new Set([...common].filter((channel) => channels.has(channel))));
	const errors = results.map((result) => result.error).filter(Boolean);
	if (complete.size === 0) {
		throw new Error(`No destination received every part of the alert: ${errors.join("; ") || "parts split across destinations"}`);
	}
	return errors.length > 0
		? { delivered: true, skipped: false, reason: "partial notification delivery", error: errors.join("; "), channels: [...complete] }
		: { delivered: true, skipped: false, channels: [...complete] };
}

/** Sends an operator message to the private Discord and optional Slack destinations. */
export async function deliverPrivateModelDiscoveryMessage(message: string): Promise<PrivateDeliveryResult> {
	const discordWebhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	const slackWebhookUrl = readBindingEnv(["MODEL_DISCOVERY_SLACK_WEBHOOK_URL"]);
	if (!discordWebhookUrl && !slackWebhookUrl) {
		return { delivered: false, skipped: true, reason: "missing Discord and Slack webhook URLs" };
	}
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
				roleId: readBindingEnv(["DISCORD_PRIVATE_MODEL_DISCOVERY_ROLE_ID"]),
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
		return { delivered: true, skipped: false, reason: "partial notification delivery", error, channels: deliveredChannels };
	}
	return { delivered: true, skipped: false, channels: deliveredChannels };
}
