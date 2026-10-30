const SUPPRESSION_EVENTS = new Set([
	"email.bounced",
	"email.complained",
	"email.suppressed",
]);

export type ResendWebhookPayload = {
	type?: unknown;
	created_at?: unknown;
	data?: {
		email_id?: unknown;
		to?: unknown;
	};
};

export function normalizeRecipientEmail(value: unknown): string | null {
	const email = String(value ?? "").trim().toLowerCase();
	return email && email.includes("@") ? email : null;
}

export function extractResendRecipient(payload: ResendWebhookPayload): string | null {
	const recipients = payload.data?.to;
	if (Array.isArray(recipients)) {
		return recipients.map(normalizeRecipientEmail).find(Boolean) ?? null;
	}
	return normalizeRecipientEmail(recipients);
}

export function resendSuppressionReason(eventType: string): "bounced" | "complained" | "suppressed" | null {
	if (!SUPPRESSION_EVENTS.has(eventType)) return null;
	return eventType.slice("email.".length) as "bounced" | "complained" | "suppressed";
}

export async function hashRecipientEmail(email: string): Promise<string> {
	const normalized = normalizeRecipientEmail(email);
	if (!normalized) throw new Error("invalid_recipient_email");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
