
import { flag } from "@/lib/flags/flag";
import type { StatsigUser } from "statsig-node-lite";

import { checkStatsigGate, getStatsigExperiment, getStatsigServerKey } from "@/lib/statsig/server";
import {
	BATCH_API_GATE,
	VIDEO_API_GATE,
	REALTIME_VOICE_GATE,
	GATEWAY_IO_LOGGING_GATE,
	AUTO_ROUTING_GATE,
	REQUEST_CLASSIFIERS_GATE,
	MODEL_SUCCESSOR_REDIRECT_GATE,
	WORKLOAD_IDENTITY_GATE,
	SLACK_AGENT_GATE,
	PRESET_EXPERIMENTS_GATE,
	SAML_SSO_GATE,
	CATALOGUE_GAMES_PREVIEW_GATE,
	ENTERPRISE_SELF_SERVE_PREVIEW_GATE,
	NEW_LANDING_PAGE_EXPERIMENT,
	NEW_LANDING_PAGE_GATE,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";

import { identify, identifyWorkspaceOwner } from "./identify";
import { isAdminViewer } from "@/lib/auth/getViewerRole";

/**
 * A Statsig feature gate decided for the viewer (or the user `identifyUser`
 * returns). Off when no Statsig server key is configured; evaluation errors
 * reach the caller.
 */
function statsigGate(key: string, identifyUser: () => Promise<StatsigUser> = identify) {
	return flag<boolean>({
		key,
		decide: async () => {
			if (!getStatsigServerKey()) return false;
			return checkStatsigGate(await identifyUser(), key);
		},
	});
}

export const gatewayNewHeroFlag = statsigGate(NEW_LANDING_PAGE_GATE);

export const gatewayHeroVariantExperiment = flag<GatewayHeroVariant>({
	key: NEW_LANDING_PAGE_EXPERIMENT,
	decide: async () => {
		if (!getStatsigServerKey()) return "classic";
		const experiment = await getStatsigExperiment(await identify(), NEW_LANDING_PAGE_EXPERIMENT);
		const variant = experiment?.get<GatewayHeroVariant>("variant", "classic");
		return variant === "experimental" ? "experimental" : "classic";
	},
});

export const batchApiFlag = statsigGate(BATCH_API_GATE);

export const gatewayIoLoggingFlag = statsigGate(GATEWAY_IO_LOGGING_GATE);

export async function webhookSettingsEnabled(): Promise<boolean> {
	const [gateEnabled, isAdmin] = await Promise.all([
		batchApiFlag().catch(() => false),
		isAdminViewer().catch(() => false),
	]);
	return gateEnabled || isAdmin;
}

export const autoRoutingFlag = statsigGate(AUTO_ROUTING_GATE);

export const requestClassifiersFlag = statsigGate(REQUEST_CLASSIFIERS_GATE);

// Decided for the workspace owner, as the gateway does, so the settings
// control only shows where the redirect can actually happen.
export const modelSuccessorRedirectFlag = statsigGate(MODEL_SUCCESSOR_REDIRECT_GATE, identifyWorkspaceOwner);

// Decided for the workspace owner, as the gateway does, so Settings → Trusted
// workloads only shows where the gateway accepts workload tokens.
export const workloadIdentityFlag = statsigGate(WORKLOAD_IDENTITY_GATE, identifyWorkspaceOwner);

export const slackAgentFlag = statsigGate(SLACK_AGENT_GATE);

/**
 * Settings → Slack stays hidden until the hosted Slack app exists. Phaseo admins
 * see it anyway, to test with their own Slack app; web-api still checks roles.
 */
export async function slackAgentSettingsEnabled(): Promise<boolean> {
	const [gateEnabled, isAdmin] = await Promise.all([
		slackAgentFlag().catch(() => false),
		isAdminViewer().catch(() => false),
	]);
	return gateEnabled || isAdmin;
}

export const presetExperimentsFlag = statsigGate(PRESET_EXPERIMENTS_GATE);

export async function presetExperimentsEnabled(): Promise<boolean> {
	return presetExperimentsFlag();
}

export const samlSsoFlag = statsigGate(SAML_SSO_GATE);

// These rooms are generally available; backend operational controls still apply.
export const videoApiFlag = flag<boolean>({
	key: VIDEO_API_GATE,
	decide: () => true,
});

export const realtimeVoiceFlag = flag<boolean>({
	key: REALTIME_VOICE_GATE,
	decide: () => true,
});

export const catalogueGamesPreviewFlag = statsigGate(CATALOGUE_GAMES_PREVIEW_GATE);

export const enterpriseSelfServePreviewFlag = statsigGate(ENTERPRISE_SELF_SERVE_PREVIEW_GATE);

export async function enterpriseSelfServePreviewEnabled(): Promise<boolean> {
	// Statsig controls rollout; mutation handlers still require workspace billing admins.
	return process.env.NODE_ENV === "development"
		|| await enterpriseSelfServePreviewFlag().catch(() => false);
}
