// Email to asks: mail sent to ask-<alias>@<WORK_INTAKE_EMAIL_DOMAIN> (routed to this Worker with
// Cloudflare Email Routing) becomes a customer ask on that intake form, the same as a form post:
// the sender's name and address are the contact, the subject and plain text are the ask. Auto
// replies, bounces and list mail are dropped, mail over MAX_EMAIL_BYTES is rejected, and each
// address is rate limited like the form endpoint.

import PostalMime from "postal-mime";
import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { recordAsk, type ParsedAsk } from "./intake";

export const MAX_EMAIL_BYTES = 1024 * 1024;
const MAX_BODY_CHARS = 50_000;
const ALIAS_PATTERN = /^ask-([a-z0-9]{16,32})@(.+)$/;

/** A new address alias: 20 lowercase letters and digits. */
export function newEmailAlias(): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	return Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) => alphabet[byte % alphabet.length]).join("");
}

/** The address for a form's alias, or null when email intake has no domain. */
export function intakeAddress(env: Pick<Env, "WORK_INTAKE_EMAIL_DOMAIN">, alias: string | null | undefined): string | null {
	const domain = String(env.WORK_INTAKE_EMAIL_DOMAIN ?? "").trim().toLowerCase();
	return domain && alias ? `ask-${alias}@${domain}` : null;
}

/** The alias in a recipient address on our domain, or null. */
export function aliasFromRecipient(to: string, domain: string): string | null {
	const match = ALIAS_PATTERN.exec(to.trim().toLowerCase());
	if (!match || match[2] !== domain.trim().toLowerCase()) return null;
	return match[1]!;
}

type MailHeaders = Array<{ key: string; value: string }>;

/** Mail that answers mail rather than asking something: auto replies, bounces, mailing lists. */
export function isAutomated(headers: MailHeaders, from: string): boolean {
	const header = (name: string) => headers.find((entry) => entry.key.toLowerCase() === name)?.value.trim().toLowerCase() ?? "";
	const auto = header("auto-submitted");
	if (auto && auto !== "no") return true;
	if (["bulk", "list", "junk", "auto_reply"].includes(header("precedence"))) return true;
	if (header("list-id") || header("list-unsubscribe") || header("x-autoreply") || header("x-autorespond")) return true;
	return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)[^@]*@/i.test(from);
}

/** Plain text from HTML, for mail with no text part. */
export function htmlToText(html: string): string {
	return html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Drops the quoted earlier conversation from a reply ("On … wrote:" and the "> " lines after it). */
export function stripQuotedReply(text: string): string {
	const lines = text.split(/\r?\n/);
	const cut = lines.findIndex((line, index) => /^On .+wrote:\s*$/.test(line) || (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line)) || (line.startsWith(">") && lines.slice(index).every((rest) => !rest.trim() || rest.startsWith(">"))));
	return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

export type EmailLike = { from: string; to: string; rawSize: number; raw: ReadableStream<Uint8Array>; headers: Headers; setReject(reason: string): void };

export type EmailOutcome = "recorded" | "ignored" | "rejected";

/** Handles one incoming email. Never throws: a failure is logged and the mail is rejected. */
export async function handleIntakeEmail(message: EmailLike, env: Env, waitUntil: (promise: Promise<unknown>) => void): Promise<EmailOutcome> {
	const domain = String(env.WORK_INTAKE_EMAIL_DOMAIN ?? "").trim();
	const alias = domain ? aliasFromRecipient(message.to, domain) : null;
	if (!alias) { message.setReject("Unknown address"); return "rejected"; }
	if (message.rawSize > MAX_EMAIL_BYTES) { message.setReject("Message too large"); return "rejected"; }
	const limiter = env.WORK_PUBLIC_RATE_LIMITER;
	if (limiter) {
		try {
			const { success } = await limiter.limit({ key: `email:${alias}` });
			if (!success) { message.setReject("Too many messages, try again later"); return "rejected"; }
		} catch {
			// A limiter outage doesn't stop mail.
		}
	}
	try {
		const client = getDataClient(env);
		const { data: form, error } = await client.from("work_intake_forms").select("id,workspace_id,name,enabled,auto_triage").eq("email_alias", alias).maybeSingle();
		if (error) throw new Error(error.message);
		if (!form?.enabled) { message.setReject("Unknown address"); return "rejected"; }
		const parsed = await PostalMime.parse(message.raw);
		const headers = (parsed.headers ?? []) as MailHeaders;
		const fromAddress = parsed.from?.address ?? message.from;
		if (isAutomated(headers, fromAddress)) return "ignored";
		const text = parsed.text?.trim() ? parsed.text : parsed.html ? htmlToText(parsed.html) : "";
		const body = stripQuotedReply(text).slice(0, MAX_BODY_CHARS);
		const subject = parsed.subject?.trim().slice(0, 300) || null;
		if (!body && !subject) return "ignored";
		const ask: ParsedAsk = {
			subject,
			body: body || subject || "",
			name: parsed.from?.name?.trim().slice(0, 200) || null,
			email: fromAddress?.trim().slice(0, 320) || null,
			metadata: { channel: "email", ...(parsed.attachments?.length ? { attachments: parsed.attachments.length } : {}) },
			redirect: null,
		};
		await recordAsk({ env, client, form, ask, waitUntil });
		return "recorded";
	} catch (error) {
		console.error("[work] email intake failed", { message: error instanceof Error ? error.message : String(error) });
		message.setReject("Temporary failure, try again later");
		return "rejected";
	}
}
