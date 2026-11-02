import { Resend } from "resend";
import type { Env } from "@/env";

// Email from the work tracker: notification digests to members and replies a person sends to a
// customer. Off unless WORK_EMAIL_ENABLED is "true" (and RESEND_API_KEY is set): with it off,
// digests are not sent and reply drafts go back to the "copy or open in your email app" flow.

export const DEFAULT_WORK_EMAIL_FROM = "noreply@phaseo.app";
const MAX_SUBJECT = 300;

export type WorkEmailEnv = Pick<Env, "WORK_EMAIL_ENABLED" | "WORK_EMAIL_FROM" | "RESEND_API_KEY">;

export function workEmailEnabled(env: WorkEmailEnv): boolean {
	return String(env.WORK_EMAIL_ENABLED ?? "").trim().toLowerCase() === "true" && Boolean(env.RESEND_API_KEY?.trim());
}

/** A display name safe for a From header: no quotes, angle brackets, control characters or line breaks. */
export function senderName(name: string | null | undefined): string {
	const clean = String(name ?? "").replace(/[\u0000-\u001f\u007f"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
	return clean || "Phaseo";
}

/** The From address: `"<name>" <address>`, the address being WORK_EMAIL_FROM's or noreply@phaseo.app. */
export function workFrom(env: WorkEmailEnv, name: string | null | undefined): string {
	const configured = String(env.WORK_EMAIL_FROM ?? "").trim();
	const address = /<([^<>\s]+@[^<>\s]+)>/.exec(configured)?.[1] ?? (/^[^<>\s"]+@[^<>\s"]+$/.test(configured) ? configured : DEFAULT_WORK_EMAIL_FROM);
	return `"${senderName(name)}" <${address}>`;
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain text as simple HTML: escaped, paragraphs on blank lines, line breaks kept. */
export function textToHtml(text: string): string {
	return text.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}

export type WorkEmail = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	fromName?: string | null;
	replyTo?: string | null;
	/** Resend's idempotency key: the same key within 24 hours sends once. */
	idempotencyKey?: string;
};

export type WorkEmailResult = { ok: true; id: string | null } | { ok: false; code: "email_disabled" | "email_failed"; message: string };

export async function sendWorkEmail(env: WorkEmailEnv, email: WorkEmail, resend: Pick<Resend, "emails"> | null = null): Promise<WorkEmailResult> {
	if (!workEmailEnabled(env)) return { ok: false, code: "email_disabled", message: "Email from the work tracker is turned off" };
	try {
		const client = resend ?? new Resend(env.RESEND_API_KEY!.trim());
		const { data, error } = await client.emails.send({
			from: workFrom(env, email.fromName),
			to: [email.to],
			subject: email.subject.replace(/[\r\n]+/g, " ").slice(0, MAX_SUBJECT),
			text: email.text,
			...(email.html ? { html: email.html } : {}),
			...(email.replyTo ? { replyTo: email.replyTo } : {}),
		}, email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined);
		if (error) return { ok: false, code: "email_failed", message: `${error.name}: ${error.message}` };
		return { ok: true, id: data?.id ?? null };
	} catch (error) {
		return { ok: false, code: "email_failed", message: error instanceof Error ? error.message : String(error) };
	}
}
