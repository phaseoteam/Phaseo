import "server-only";

import { flag } from "flags/next";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getStatsigFlagsAdapter } from "@/lib/statsig/server";
import {
	BATCH_API_GATE,
	GATEWAY_IO_LOGGING_GATE,
	PRESET_EXPERIMENTS_GATE,
	NEW_LANDING_PAGE_EXPERIMENT,
	NEW_LANDING_PAGE_GATE,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";

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

/**
 * Temporary production rollout gate for passkey enrollment and management.
 * The gate itself targets approved admin user IDs in Statsig; callers must
 * still verify the Phaseo admin role before exposing account controls.
 */
export const passkeysAdminBetaFlag = statsigAdapter
	? flag<boolean, StatsigUser>({
			key: "passkeys_admin_beta",
			identify,
			adapter: statsigAdapter.featureGate((gate) => gate.value),
		})
	: flag<boolean>({
			key: "passkeys_admin_beta",
			decide: () => false,
		});
