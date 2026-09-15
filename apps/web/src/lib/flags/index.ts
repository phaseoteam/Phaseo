import "server-only";

import { flag } from "flags/next";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getStatsigFlagsAdapter } from "@/lib/statsig/server";
import {
	BATCH_API_GATE,
	VIDEO_API_GATE,
	REALTIME_VOICE_GATE,
	GATEWAY_IO_LOGGING_GATE,
	AUTO_ROUTING_GATE,
	PRESET_EXPERIMENTS_GATE,
	SAML_SSO_GATE,
	CATALOGUE_GAMES_PREVIEW_GATE,
	ENTERPRISE_SELF_SERVE_PREVIEW_GATE,
	NEW_LANDING_PAGE_EXPERIMENT,
	NEW_LANDING_PAGE_GATE,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";

import { identify } from "./identify";
import { isAdminViewer } from "@/lib/auth/getViewerRole";

const statsigAdapter = getStatsigFlagsAdapter();

export const gatewayNewHeroFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: NEW_LANDING_PAGE_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: NEW_LANDING_PAGE_GATE,
			decide: () => false,
		});

export const gatewayHeroVariantExperiment = statsigAdapter
	? flag<GatewayHeroVariant, StatsigUser>({
			key: NEW_LANDING_PAGE_EXPERIMENT,
			identify,
			adapter: statsigAdapter.experiment((experiment) => {
				const variant = experiment.get<GatewayHeroVariant>(
					"variant",
					"classic"
				);
				return variant === "experimental" ? "experimental" : "classic";
			}),
		})
	: flag<GatewayHeroVariant>({
			key: NEW_LANDING_PAGE_EXPERIMENT,
			decide: () => "classic",
	});

export const batchApiFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: BATCH_API_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: BATCH_API_GATE,
			decide: () => false,
	});

export const gatewayIoLoggingFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: GATEWAY_IO_LOGGING_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: GATEWAY_IO_LOGGING_GATE,
			decide: () => false,
		});

export async function webhookSettingsEnabled(): Promise<boolean> {
	const [gateEnabled, isAdmin] = await Promise.all([
		batchApiFlag().catch(() => false),
		isAdminViewer().catch(() => false),
	]);
	return gateEnabled || isAdmin;
}

export const autoRoutingFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: AUTO_ROUTING_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: AUTO_ROUTING_GATE,
			decide: () => false,
		});

export const presetExperimentsFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: PRESET_EXPERIMENTS_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: PRESET_EXPERIMENTS_GATE,
			decide: () => false,
		});

export async function presetExperimentsEnabled(): Promise<boolean> {
	return presetExperimentsFlag();
}

export const samlSsoFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: SAML_SSO_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: SAML_SSO_GATE,
			decide: () => false,
		});

export const videoApiFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: VIDEO_API_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: VIDEO_API_GATE,
			decide: () => false,
		});

export const realtimeVoiceFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: REALTIME_VOICE_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: REALTIME_VOICE_GATE,
			decide: () => false,
		});

export const catalogueGamesPreviewFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: CATALOGUE_GAMES_PREVIEW_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: CATALOGUE_GAMES_PREVIEW_GATE,
			decide: () => false,
		});

export const enterpriseSelfServePreviewFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: ENTERPRISE_SELF_SERVE_PREVIEW_GATE,
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: ENTERPRISE_SELF_SERVE_PREVIEW_GATE,
			decide: () => false,
		});

export async function enterpriseSelfServePreviewEnabled(): Promise<boolean> {
	const [isAdmin, gateEnabled] = await Promise.all([
		isAdminViewer().catch(() => false),
		enterpriseSelfServePreviewFlag().catch(() => false),
	]);
	return isAdmin && (gateEnabled || process.env.NODE_ENV === "development");
}
