import type {
	ResendCheckoutStartedPayload,
	ResendCreditsPurchasedPayload,
} from "@/lib/automations/resend-events";
import { maskEmailForWebhook } from "@/lib/auth/accountLifecycleDiscord";

export type BillingDiscordEvent = "checkout_started" | "credits_purchased";

type BillingDiscordPayload = {
	content: string;
	allowed_mentions: {
		parse: string[];
	};
};

type BillingDiscordArgs =
	| {
		event: "checkout_started";
		email: string | null;
		payload: ResendCheckoutStartedPayload;
	}
	| {
		event: "credits_purchased";
		email: string | null;
		payload: ResendCreditsPurchasedPayload;
	};

const BILLING_EVENT_METADATA: Record<
	BillingDiscordEvent,
	{ title: string; timestampLabel: string }
> = {
	checkout_started: {
		title: "Phaseo checkout started",
		timestampLabel: "started_at",
	},
	credits_purchased: {
		title: "Phaseo credits purchased",
		timestampLabel: "credited_at",
	},
};

function formatCurrencyAmount(amountMajor: number, currency: string): string {
	const normalizedCurrency = String(currency ?? "").trim().toLowerCase() || "usd";
	if (!Number.isFinite(amountMajor)) return `unknown ${normalizedCurrency}`;
	return `${amountMajor.toFixed(2)} ${normalizedCurrency}`;
}

export function resolveBillingDiscordWebhookUrl(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return String(env.DISCORD_BILLING_WEBHOOK_URL ?? "").trim();
}

export function buildBillingDiscordPayload(
	args: BillingDiscordArgs,
): BillingDiscordPayload {
	const eventMetadata = BILLING_EVENT_METADATA[args.event];

	if (args.event === "checkout_started") {
		return {
			content: [
				eventMetadata.title,
				`- event: \`${args.event}\``,
				`- workspace_id: \`${args.payload.workspaceId}\``,
				`- user_id: \`${args.payload.userId}\``,
				`- email: \`${maskEmailForWebhook(args.email)}\``,
				`- checkout_session_id: \`${args.payload.checkoutSessionId}\``,
				`- checkout_kind: \`${args.payload.checkoutKind}\``,
				`- amount: \`${formatCurrencyAmount(
					args.payload.amountPence / 100,
					args.payload.currency,
				)}\``,
				`- ${eventMetadata.timestampLabel}: \`${args.payload.startedAtIso}\``,
			].join("\n"),
			allowed_mentions: { parse: [] },
		};
	}

	return {
		content: [
			eventMetadata.title,
			`- event: \`${args.event}\``,
			`- workspace_id: \`${args.payload.workspaceId}\``,
			`- payment_intent_id: \`${args.payload.paymentIntentId}\``,
			`- email: \`${maskEmailForWebhook(args.email)}\``,
			`- checkout_session_id: \`${args.payload.checkoutSessionId ?? "unknown"}\``,
			`- purchase_kind: \`${args.payload.kind}\``,
			`- amount: \`${formatCurrencyAmount(
				args.payload.amountNanos / 1_000_000_000,
				args.payload.currency,
			)}\``,
			`- ${eventMetadata.timestampLabel}: \`${args.payload.creditedAtIso}\``,
		].join("\n"),
		allowed_mentions: { parse: [] },
	};
}

export async function sendBillingDiscordWebhook(
	args: BillingDiscordArgs,
	options?: {
		env?: NodeJS.ProcessEnv;
		fetchImpl?: typeof fetch;
	},
): Promise<boolean> {
	const webhookUrl = resolveBillingDiscordWebhookUrl(options?.env);
	if (!webhookUrl) return false;

	const fetchImpl = options?.fetchImpl ?? fetch;
	const payload = buildBillingDiscordPayload(args);

	const res = await fetchImpl(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(
			`discord_webhook_error:${res.status}:${detail || res.statusText}`,
		);
	}

	return true;
}
