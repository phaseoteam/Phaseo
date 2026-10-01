const SLACK_WEBHOOK_TIMEOUT_MS = 30_000;
const ALLOWED_SLACK_WEBHOOK_HOSTS = new Set(["hooks.slack.com", "hooks.slack-gov.com"]);

export type SlackWebhookPayload = {
	text: string;
};

export function validateSlackWebhookUrl(webhookUrl: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(webhookUrl);
	} catch {
		throw new Error("Slack webhook URL is invalid.");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("Slack webhook URL must use https.");
	}
	if (!ALLOWED_SLACK_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
		throw new Error("Slack webhook URL host is not allowed.");
	}
	if (!parsed.pathname.startsWith("/services/") || parsed.pathname.split("/").filter(Boolean).length < 4) {
		throw new Error("Slack webhook URL path is invalid.");
	}
	return parsed;
}

export async function sendSlackWebhookMessage(
	webhookUrl: string,
	message: string,
	request: typeof fetch = fetch,
): Promise<void> {
	const parsed = validateSlackWebhookUrl(webhookUrl);
	const response = await request(parsed.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text: message } satisfies SlackWebhookPayload),
		signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT_MS),
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Slack webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
	}
}
