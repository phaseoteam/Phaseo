import "server-only";

import { flag } from "flags/next";
import type { StatsigUser } from "@flags-sdk/statsig";

import {
	getStatsigFlagsAdapter,
} from "@/lib/statsig/server";
import {
	GATEWAY_IO_LOGGING_GATE,
	NEW_LANDING_PAGE_EXPERIMENT,
	NEW_LANDING_PAGE_GATE,
	PRESET_EXPERIMENTS_GATE,
	getWebFeatureGate,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";
import { isAdminViewer } from "@/lib/auth/getViewerRole";

import { identify } from "./identify";

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

async function gatedBetaFeatureEnabled(
	featureKey: string,
	gateCheck: () => Promise<boolean>
): Promise<boolean> {
	const feature = getWebFeatureGate(featureKey);
	if (feature?.stage === "ga") return true;

	if (feature?.stage === "internal") {
		return (await isAdminViewer()) || (await gateCheck());
	}

	if (feature?.stage === "beta") {
		return (await isAdminViewer()) || (await gateCheck());
	}

	return gateCheck();
}

export async function gatewayIoLoggingEnabled(): Promise<boolean> {
	return gatedBetaFeatureEnabled(GATEWAY_IO_LOGGING_GATE, gatewayIoLoggingFlag);
}

export async function presetExperimentsEnabled(): Promise<boolean> {
	return gatedBetaFeatureEnabled(PRESET_EXPERIMENTS_GATE, presetExperimentsFlag);
}

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
