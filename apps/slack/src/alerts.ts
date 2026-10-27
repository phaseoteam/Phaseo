import type { Env } from "./env";
import type { Installation } from "./installations";
import type { Db } from "./supabase";

// Tells the Phaseo team when the agent is removed inside Slack, in the internal
// Discord channel and format web-api uses when a workspace installs or uninstalls
// in Phaseo (apps/web-api/src/lib/slack-agent-alerts.ts). Off without
// DISCORD_SIGNUP_WEBHOOK_URL. It never throws and gives up after a few seconds,
// so it can't undo or hold up an uninstall, and it carries names and ids only:
// never Slack messages, people or tokens.

const ALERT_TIMEOUT_MS = 5_000;
const MAX_NAME_LENGTH = 100;

/** Workspace and team names are chosen by customers: one line, no code-span breaks, short. */
function name(value: string | null | undefined): string {
	const cleaned = String(value ?? "").replace(/[`\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim();
	return cleaned ? cleaned.slice(0, MAX_NAME_LENGTH) : "unknown";
}

export async function alertUninstalledInSlack(
	env: Env,
	db: Db,
	installation: Pick<Installation, "id" | "workspace_id" | "slack_app_id">,
	event: "app_uninstalled" | "tokens_revoked",
): Promise<void> {
	const url = env.DISCORD_SIGNUP_WEBHOOK_URL?.trim();
	if (!url) return;
	try {
		// The names make the alert readable; without them it still goes, with ids.
		const [team, workspace] = await Promise.all([
			db.select<{ team_name: string | null }>("slack_installations", { select: "team_name", id: `eq.${installation.id}`, limit: "1" }).catch(() => []),
			db.select<{ name: string | null }>("workspaces", { select: "name", id: `eq.${installation.workspace_id}`, limit: "1" }).catch(() => []),
		]);
		const content = [
			"Slack agent uninstalled",
			`- workspace: \`${name(workspace[0]?.name)}\` (\`${installation.workspace_id}\`)`,
			`- slack_team: \`${name(team[0]?.team_name)}\``,
			`- app: \`${installation.slack_app_id ? "company" : "hosted"}\``,
			`- uninstalled_by: removed in Slack (\`${event}\`)`,
		].join("\n");
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
			signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
		});
		if (!response.ok) console.error("[slack-agent] uninstall alert failed", { installationId: installation.id, status: response.status });
	} catch {
		console.error("[slack-agent] uninstall alert failed", { installationId: installation.id, status: null });
	}
}
