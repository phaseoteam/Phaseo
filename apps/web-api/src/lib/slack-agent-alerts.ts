import { maskEmail } from "@/auth/accountLifecycleDiscord";
import type { Env } from "@/env";

// Tells the Phaseo team when a workspace installs or uninstalls the Slack agent,
// in the internal Discord channel that already gets new signups and account
// deletions (DISCORD_SIGNUP_WEBHOOK_URL). Off when that isn't set. Best effort:
// callers run it in waitUntil, it gives up after a few seconds and it never
// throws, so an alert can't fail or hold up an install. Names and ids only, with
// the email masked: never Slack messages or tokens. The Slack Worker sends the
// same alert when the app is removed inside Slack (apps/slack/src/alerts.ts).

const ALERT_TIMEOUT_MS = 5_000;
const MAX_NAME_LENGTH = 100;

export type SlackAgentAlert = {
	event: "installed" | "uninstalled";
	workspaceId: string;
	workspaceName: string | null;
	teamName: string | null;
	customApp: boolean;
	actor: { id: string; email: string | null };
};

/** Workspace and team names are chosen by customers: one line, no code-span breaks, short. */
function name(value: string | null): string {
	const cleaned = String(value ?? "").replace(/[`\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim();
	return cleaned ? cleaned.slice(0, MAX_NAME_LENGTH) : "unknown";
}

export function slackAgentAlertMessage(alert: SlackAgentAlert) {
	const actorLabel = alert.event === "installed" ? "installed_by" : "uninstalled_by";
	return {
		content: [
			alert.event === "installed" ? "Slack agent installed" : "Slack agent uninstalled",
			`- workspace: \`${name(alert.workspaceName)}\` (\`${alert.workspaceId}\`)`,
			`- slack_team: \`${name(alert.teamName)}\``,
			`- app: \`${alert.customApp ? "company" : "hosted"}\``,
			`- ${actorLabel}: \`${alert.actor.id}\` (\`${maskEmail(alert.actor.email)}\`)${alert.event === "uninstalled" ? " in Phaseo settings" : ""}`,
		].join("\n"),
		allowed_mentions: { parse: [] },
	};
}

export async function sendSlackAgentAlert(env: Env, alert: SlackAgentAlert): Promise<void> {
	const url = env.DISCORD_SIGNUP_WEBHOOK_URL?.trim();
	if (!url) return;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(slackAgentAlertMessage(alert)),
			signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
		});
		if (!response.ok) console.error("slack_agent_alert_failed", { event: alert.event, status: response.status });
	} catch {
		console.error("slack_agent_alert_failed", { event: alert.event, status: null });
	}
}
