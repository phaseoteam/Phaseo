import { getBindings } from "@/runtime/env";

type SendEmailArgs = {
	to: string;
	subject?: string;
	html?: string;
	text?: string;
	template?: {
		id: string;
		variables?: Record<string, string | number>;
	};
	from?: string;
	replyTo?: string;
	/** Extra message headers, e.g. List-Unsubscribe. */
	headers?: Record<string, string>;
	idempotencyKey?: string;
	signal?: AbortSignal;
};

/**
 * Whether the recipient unsubscribed from a Resend contact list (e.g. via an
 * onboarding automation's unsubscribe link). No contact means not unsubscribed.
 * Lookup failures throw so callers don't send to someone who may have opted out.
 */
export async function isResendContactUnsubscribed(email: string, signal?: AbortSignal): Promise<boolean> {
	const apiKey = getBindings().RESEND_API_KEY;
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}
	const normalized = email.trim().toLowerCase();
	if (!normalized) throw new Error("invalid_recipient_email");

	const res = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(normalized)}`, {
		signal,
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (res.status === 404) return false;
	if (!res.ok) {
		throw new Error(`resend_contact_lookup_error:${res.status}`);
	}
	const contact = (await res.json().catch(() => null)) as { unsubscribed?: unknown } | null;
	if (!contact || typeof contact.unsubscribed !== "boolean") {
		throw new Error("resend_contact_lookup_error:invalid_response");
	}
	return contact.unsubscribed;
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
	const bindings = getBindings();
	const apiKey = bindings.RESEND_API_KEY;
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}

	const from =
		(args.from && args.from.trim()) ||
		(bindings.RESEND_FROM_EMAIL && bindings.RESEND_FROM_EMAIL.trim()) ||
		"Phaseo <noreply@phaseo.app>";

	if (args.template?.id) {
		const res = await fetch("https://api.resend.com/emails", {
			signal: args.signal,
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
			},
			body: JSON.stringify({
				from,
				to: args.to,
				// If template has no defaults, Resend requires from/subject/reply_to in payload.
				...(args.subject ? { subject: args.subject } : {}),
				template: {
					id: args.template.id,
					...(args.template.variables ? { variables: args.template.variables } : {}),
				},
			}),
		});

		if (!res.ok) {
			let detail = "";
			try {
				detail = await res.text();
			} catch {
				detail = "";
			}
			throw new Error(`resend_error:${res.status}:${detail || res.statusText}`);
		}
		return;
	}

	if (!args.subject) throw new Error("missing_email_subject");
	if (!args.html) throw new Error("missing_email_html");

	const res = await fetch("https://api.resend.com/emails", {
		signal: args.signal,
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
		},
		body: JSON.stringify({
			from,
			to: args.to,
			subject: args.subject,
			html: args.html,
			...(args.text ? { text: args.text } : {}),
			...(args.replyTo ? { reply_to: args.replyTo } : {}),
			...(args.headers && Object.keys(args.headers).length > 0 ? { headers: args.headers } : {}),
		}),
	});

	if (!res.ok) {
		let detail = "";
		try {
			detail = await res.text();
		} catch {
			detail = "";
		}
		throw new Error(`resend_error:${res.status}:${detail || res.statusText}`);
	}
}
