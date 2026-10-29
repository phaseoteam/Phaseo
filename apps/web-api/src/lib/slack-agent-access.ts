import type { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

type DataClient = ReturnType<typeof getDataClient>;

// Whether someone may install the Slack agent. Settings → Slack only shows while the
// Statsig gate slack_agent passes for the signed-in user, or for Phaseo admins
// (slackAgentSettingsEnabled in apps/web/src/lib/flags/index.ts), so installing asks
// the same: a workspace admin outside the rollout can't install by calling the API
// directly. Statsig is asked about the user the web app identifies
// (buildAuthenticatedStatsigUser in apps/web/src/lib/statsig/shared.ts, with the
// profile /api/account/auth/statsig returns, and the selected workspace), so a rule
// on their email, Supabase ID, beta opt-in or beta features decides both the same
// way. Only the browser's stable ID can't be sent from here. Like the gateway's
// gates, a failed check is a no.

const SLACK_AGENT_GATE = "slack_agent";
const GATE_TIMEOUT_MS = 2_000;

export type SlackAgentInstaller = {
	userId: string;
	email: string | null;
	workspaceId: string;
};

type Profile = { isAdmin: boolean; betaOptIn: boolean; betaFeatureKeys: string[] };

function statsigEnvironmentTier(env: Env): "production" | "staging" | "development" {
	if (env.ENV === "production") return "production";
	if (env.ENV === "preview" || env.ENV === "staging") return "staging";
	return "development";
}

/** The user's Phaseo role and beta profile, as /api/account/auth/statsig gives the web app. Unreadable counts as no admin and no betas. */
async function installerProfile(client: DataClient, userId: string): Promise<Profile> {
	const { data, error } = await client.from("users").select("role,beta_opt_in,beta_features").eq("user_id", userId).maybeSingle();
	if (error || !data) return { isAdmin: false, betaOptIn: false, betaFeatureKeys: [] };
	const isAdmin = String(data.role ?? "").toLowerCase() === "admin";
	const features = data.beta_features && typeof data.beta_features === "object" && !Array.isArray(data.beta_features)
		? Object.entries(data.beta_features as Record<string, unknown>).filter(([, enabled]) => enabled === true).map(([key]) => key)
		: [];
	// The web app's profile turns the realtime voice beta on for admins only.
	const betaFeatureKeys = features.filter((key) => key !== "chat_realtime_voice");
	if (isAdmin) betaFeatureKeys.push("chat_realtime_voice");
	return { isAdmin, betaOptIn: Boolean(data.beta_opt_in) || isAdmin, betaFeatureKeys };
}

async function slackAgentGatePasses(env: Env, installer: SlackAgentInstaller, profile: Profile): Promise<boolean> {
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
					customIDs: { supabaseUserID: installer.userId, workspaceID: installer.workspaceId },
					custom: { betaOptIn: profile.betaOptIn, betaFeatureKeys: profile.betaFeatureKeys, workspace_id: installer.workspaceId },
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

/** Whether this user may install the Slack agent: a Phaseo admin (users.role), or inside the slack_agent rollout. */
export async function slackAgentInstallAllowed(env: Env, client: DataClient, installer: SlackAgentInstaller): Promise<boolean> {
	const profile = await installerProfile(client, installer.userId);
	if (profile.isAdmin) return true;
	return slackAgentGatePasses(env, installer, profile);
}
