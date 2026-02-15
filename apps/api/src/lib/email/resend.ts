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
};

export async function sendEmail(args: SendEmailArgs): Promise<void> {
	const bindings = getBindings();
	const apiKey = bindings.RESEND_API_KEY;
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}

	const from =
		(args.from && args.from.trim()) ||
		(bindings.RESEND_FROM_EMAIL && bindings.RESEND_FROM_EMAIL.trim()) ||
		"AI Stats <noreply@phaseo.app>";

	if (args.template?.id) {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
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
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: args.to,
			subject: args.subject,
			html: args.html,
			...(args.text ? { text: args.text } : {}),
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

