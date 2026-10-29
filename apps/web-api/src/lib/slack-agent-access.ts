import type { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

type DataClient = ReturnType<typeof getDataClient>;

// Whether someone may install the Slack agent. Settings → Slack only shows while the
// Statsig gate slack_agent passes for the signed-in user, or for Phaseo admins
// (slackAgentSettingsEnabled in apps/web/src/lib/flags/index.ts), so installing asks
// the same: a workspace admin outside the rollout can't install by calling the API
// directly. It asks Statsig for the user the web app identifies (their ID and email,
// with the workspace as a custom ID). Like the gateway's gates, a failed check is a no.

const SLACK_AGENT_GATE = "slack_agent";
const GATE_TIMEOUT_MS = 2_000;

export type SlackAgentInstaller = {
	userId: string;
	email: string | null;
	workspaceId: string;
};

function statsigEnvironmentTier(env: Env): "production" | "staging" | "development" {
	if (env.ENV === "production") return "production";
	if (env.ENV === "preview" || env.ENV === "staging") return "staging";
	return "development";
}

async function slackAgentGatePasses(env: Env, installer: SlackAgentInstaller): Promise<boolean> {
	const statsigKey = env.STATSIG_SERVER_KEY?.trim();
	// Local development without Statsig can install, as the web app's admins can.
	if (!statsigKey) return env.ENV === "development";
	try {
		const response = await fetch("https://api.statsig.com/v1/check_gate", {
			method: "POST",
			headers: { "Content-Type": "application/json", "statsig-api-key": statsigKey },
			body: JSON.stringify({
				gateName: SLACK_AGENT_GATE,
				user: {
					userID: installer.userId,
					...(installer.email ? { email: installer.email } : {}),
					customIDs: { workspaceID: installer.workspaceId },
					custom: { workspace_id: installer.workspaceId },
					statsigEnvironment: { tier: statsigEnvironmentTier(env) },
				},
			}),
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});
		if (!response.ok) return false;
		const payload = (await response.json().catch(() => null)) as { value?: unknown; results?: Record<string, { value?: unknown }> } | null;
		if (typeof payload?.value === "boolean") return payload.value;
		return payload?.results?.[SLACK_AGENT_GATE]?.value === true;
	} catch (error) {
		console.error("[web-api] Slack agent gate check failed", { workspaceId: installer.workspaceId, error: error instanceof Error ? error.message : String(error) });
		return false;
	}
}

/** Whether the user is a Phaseo admin (users.role), who sees Settings → Slack outside the rollout. */
async function isPhaseoAdmin(client: DataClient, userId: string): Promise<boolean> {
	const { data, error } = await client.from("users").select("role").eq("user_id", userId).maybeSingle();
	if (error) return false;
	return String(data?.role ?? "").toLowerCase() === "admin";
}

/** Whether this user may install the Slack agent: a Phaseo admin, or inside the slack_agent rollout. */
export async function slackAgentInstallAllowed(env: Env, client: DataClient, installer: SlackAgentInstaller): Promise<boolean> {
	if (await isPhaseoAdmin(client, installer.userId)) return true;
	return slackAgentGatePasses(env, installer);
}
