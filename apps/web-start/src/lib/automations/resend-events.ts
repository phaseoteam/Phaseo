import { Resend } from "resend";
import { RESEND_ONBOARDING_EVENT_NAMES } from "@/lib/automations/resend-onboarding.constants";

export type ResendUserCreatedPayload = {
	userId: string;
	workspaceId: string;
	displayName: string;
	firstName: string;
	source: "auth_callback" | "server_action";
	createdAtIso: string;
};

export type ResendCheckoutStartedPayload = {
	workspaceId: string;
	userId: string;
	firstName: string;
	checkoutSessionId: string;
	checkoutKind: "oneoff" | "pay_and_save" | "legacy_checkout";
	currency: string;
	amountPence: number;
	startedAtIso: string;
};

export type ResendCreditsPurchasedPayload = {
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
	const normalized = String(value ?? "").trim();
	if (!normalized) return "";
	return normalized.split(/\s+/)[0] ?? "";
}

function readBoolEnv(name: string): boolean | null {
	const raw = String(process.env[name] ?? "").trim().toLowerCase();
	if (!raw) return null;
	if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
	if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
	return null;
}

function isResendConfigured(): boolean {
	return String(process.env.RESEND_API_KEY ?? "").trim().length > 0;
}

export function isResendOnboardingAutomationsEnabled(): boolean {
	const explicit = readBoolEnv("RESEND_ONBOARDING_AUTOMATIONS_ENABLED");
	if (explicit !== null) {
		return explicit && isResendConfigured();
	}
	return isResendConfigured();
}

function createResendClient(): Resend {
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
	return new Resend(apiKey);
}

async function sendResendEvent(args: {
	event: string;
	email: string;
	payload: Record<string, unknown>;
}): Promise<void> {
	if (!isResendOnboardingAutomationsEnabled()) return;
	const email = args.email.trim();
	if (!email) return;
	const resend = createResendClient();
	const { error } = await resend.events.send({
		event: args.event,
		email,
		payload: args.payload,
	});
	if (error) {
		throw new Error(`resend_event_error:${args.event}:${error.name}:${error.message}`);
	}
}

export async function sendUserCreatedEvent(args: {
	email: string;
	payload: ResendUserCreatedPayload;
}): Promise<void> {
	await sendResendEvent({
		event: RESEND_ONBOARDING_EVENT_NAMES.USER_CREATED,
		email: args.email,
		payload: args.payload,
	});
}

export async function sendCheckoutStartedEvent(args: {
	email: string;
	payload: ResendCheckoutStartedPayload;
}): Promise<void> {
	await sendResendEvent({
		event: RESEND_ONBOARDING_EVENT_NAMES.CHECKOUT_STARTED,
		email: args.email,
		payload: args.payload,
	});
}

export async function sendCreditsPurchasedEvent(args: {
	email: string;
	payload: ResendCreditsPurchasedPayload;
}): Promise<void> {
	await sendResendEvent({
		event: RESEND_ONBOARDING_EVENT_NAMES.CREDITS_PURCHASED,
		email: args.email,
		payload: args.payload,
	});
}
