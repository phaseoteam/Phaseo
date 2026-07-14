export type AccountLifecycleDiscordEvent = "signup" | "account_deleted";

type AccountLifecycleDiscordPayload = {
	content: string;
	allowed_mentions: {
		parse: string[];
	};
};

const EVENT_METADATA: Record<
	AccountLifecycleDiscordEvent,
	{ title: string; timestampLabel: string }
> = {
	signup: {
		title: "New Phaseo signup",
		timestampLabel: "created_at",
	},
	account_deleted: {
		title: "Phaseo account deleted",
		timestampLabel: "deleted_at",
	},
};

export function maskEmailForWebhook(email: string | null): string {
	if (!email) return "unknown";
	const atIndex = email.indexOf("@");
	if (atIndex <= 0 || atIndex === email.length - 1) return "unknown";
	const localPart = email.slice(0, atIndex);
	const domain = email.slice(atIndex + 1);
	const maskedLocal = `${localPart[0]}${"*".repeat(
		Math.max(1, localPart.length - 1),
	)}`;
	return `${maskedLocal}@${domain}`;
}

export function resolveAccountLifecycleDiscordWebhookUrl(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return String(env.DISCORD_SIGNUP_WEBHOOK_URL ?? "").trim();
}

export function buildAccountLifecycleDiscordPayload(args: {
	event: AccountLifecycleDiscordEvent;
	userId: string;
	email: string | null;
	timestampIso: string;
}): AccountLifecycleDiscordPayload {
	const eventMetadata = EVENT_METADATA[args.event];

	return {
		content: [
			eventMetadata.title,
			`- event: \`${args.event}\``,
			`- user_id: \`${args.userId}\``,
			`- email: \`${maskEmailForWebhook(args.email)}\``,
			`- ${eventMetadata.timestampLabel}: \`${args.timestampIso}\``,
		].join("\n"),
		allowed_mentions: { parse: [] },
	};
}

export async function sendAccountLifecycleDiscordWebhook(
	args: {
		event: AccountLifecycleDiscordEvent;
		userId: string;
		email: string | null;
		timestampIso: string;
	},
	options?: {
		env?: NodeJS.ProcessEnv;
		fetchImpl?: typeof fetch;
	},
): Promise<boolean> {
	const webhookUrl = resolveAccountLifecycleDiscordWebhookUrl(options?.env);
	if (!webhookUrl) return false;

	const fetchImpl = options?.fetchImpl ?? fetch;
	const payload = buildAccountLifecycleDiscordPayload(args);

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
