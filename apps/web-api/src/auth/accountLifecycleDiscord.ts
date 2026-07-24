import type { Env } from "@/env";

function maskEmail(email: string | null): string {
	if (!email) return "unknown";
	const at = email.indexOf("@");
	if (at <= 0 || at === email.length - 1) return "unknown";
	return `${email[0]}${"*".repeat(Math.max(1, at - 1))}${email.slice(at)}`;
}

export async function notifyAccountDeleted(env: Env, user: { id: string; email: string | null }): Promise<void> {
	const url = env.DISCORD_SIGNUP_WEBHOOK_URL?.trim();
	if (!url) return;
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			content: ["Phaseo account deleted", "- event: `account_deleted`", `- user_id: \`${user.id}\``, `- email: \`${maskEmail(user.email)}\``, `- deleted_at: \`${new Date().toISOString()}\``].join("\n"),
			allowed_mentions: { parse: [] },
		}),
	});
	if (!response.ok) throw new Error(`discord_webhook_error:${response.status}`);
}
