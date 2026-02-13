import { getBindings } from "@/runtime/env";

type SendEmailArgs = {
	to: string;
	subject: string;
	html: string;
	text?: string;
};

export async function sendEmail(args: SendEmailArgs): Promise<void> {
	const bindings = getBindings();
	const apiKey = bindings.RESEND_API_KEY;
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}

	const from =
		(bindings.RESEND_FROM_EMAIL && bindings.RESEND_FROM_EMAIL.trim()) ||
		"AI Stats <noreply@phaseo.app>";

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

