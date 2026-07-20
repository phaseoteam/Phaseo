import { Resend } from "resend";
import type { Env } from "@/env";

export type CheckoutStartedPayload = {
	workspaceId: string;
	userId: string;
	firstName: string;
	checkoutSessionId: string;
	checkoutKind: "oneoff" | "pay_and_save" | "legacy_checkout";
	currency: string;
	amountPence: number;
	startedAtIso: string;
};

export type CreditsPurchasedPayload = {
	workspaceId: string;
	paymentIntentId: string;
	firstName: string;
	checkoutSessionId?: string;
	currency: string;
	amountNanos: number;
	kind: "top_up" | "top_up_one_off" | "auto_top_up";
	creditedAtIso: string;
};

export function deriveFirstName(value: string | null | undefined): string {
	return String(value ?? "").trim().split(/\s+/)[0] ?? "";
}

async function sendResendEvent(
	env: Env,
	event: "checkout.started" | "credits.purchased",
	email: string,
	payload: Record<string, unknown>,
) {
	const apiKey = env.RESEND_API_KEY?.trim();
	if (!apiKey || !email.trim()) return false;
	const { error } = await new Resend(apiKey).events.send({ event, email: email.trim(), payload });
	if (error) throw new Error(`resend_event_error:${event}:${error.name}:${error.message}`);
	return true;
}

export async function sendCheckoutStartedEvent(
	env: Env,
	args: { email: string; payload: CheckoutStartedPayload },
) {
	return sendResendEvent(env, "checkout.started", args.email, args.payload);
}

export async function sendCreditsPurchasedEvent(
	env: Env,
	args: { email: string; payload: CreditsPurchasedPayload },
) {
	return sendResendEvent(env, "credits.purchased", args.email, args.payload);
}

function maskEmail(email: string | null) {
	if (!email) return "unknown";
	const at = email.indexOf("@");
	if (at <= 0 || at === email.length - 1) return "unknown";
	return `${email[0]}${"*".repeat(Math.max(1, at - 1))}${email.slice(at)}`;
}

function amount(value: number, currency: string) {
	return `${Number.isFinite(value) ? value.toFixed(2) : "unknown"} ${currency.trim().toLowerCase() || "usd"}`;
}

type DiscordArgs =
	| { event: "checkout_started"; email: string | null; payload: CheckoutStartedPayload }
	| { event: "credits_purchased"; email: string | null; payload: CreditsPurchasedPayload };

export async function sendBillingDiscordWebhook(env: Env, args: DiscordArgs) {
	const webhookUrl = env.DISCORD_BILLING_WEBHOOK_URL?.trim();
	if (!webhookUrl) return false;
	const lines = args.event === "checkout_started"
		? [
			"Phaseo checkout started",
			`- event: \`${args.event}\``,
			`- workspace_id: \`${args.payload.workspaceId}\``,
			`- user_id: \`${args.payload.userId}\``,
			`- email: \`${maskEmail(args.email)}\``,
			`- checkout_session_id: \`${args.payload.checkoutSessionId}\``,
			`- checkout_kind: \`${args.payload.checkoutKind}\``,
			`- amount: \`${amount(args.payload.amountPence / 100, args.payload.currency)}\``,
			`- started_at: \`${args.payload.startedAtIso}\``,
		]
		: [
			"Phaseo credits purchased",
			`- event: \`${args.event}\``,
			`- workspace_id: \`${args.payload.workspaceId}\``,
			`- payment_intent_id: \`${args.payload.paymentIntentId}\``,
			`- email: \`${maskEmail(args.email)}\``,
			`- checkout_session_id: \`${args.payload.checkoutSessionId ?? "unknown"}\``,
			`- purchase_kind: \`${args.payload.kind}\``,
			`- amount: \`${amount(args.payload.amountNanos / 1_000_000_000, args.payload.currency)}\``,
			`- credited_at: \`${args.payload.creditedAtIso}\``,
		];
	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content: lines.join("\n"), allowed_mentions: { parse: [] } }),
	});
	if (!response.ok) throw new Error(`discord_webhook_error:${response.status}:${await response.text()}`);
	return true;
}
