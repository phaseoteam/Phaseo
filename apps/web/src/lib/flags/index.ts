import "server-only";

import { flag } from "flags/next";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getServerStatsigUser, getStatsigFlagsAdapter } from "@/lib/statsig/server";
import {
	BATCH_API_GATE,
	GATEWAY_IO_LOGGING_GATE,
	MODELS_CATALOGUE_V2_BETA_KEY,
	NEW_LANDING_PAGE_EXPERIMENT,
	NEW_LANDING_PAGE_GATE,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";

import { identify } from "./identify";

const statsigAdapter = getStatsigFlagsAdapter();

export const modelsCatalogueV2Flag = flag<boolean>({
	key: MODELS_CATALOGUE_V2_BETA_KEY,
	description: "Use the parallel V2 models catalogue tables.",
	defaultValue: false,
	decide: async () => {
		const user = await getServerStatsigUser();
		const custom = user.custom as Record<string, unknown> | undefined;
		const enabledKeys = custom?.betaFeatureKeys;
		return (
			Array.isArray(enabledKeys) &&
			enabledKeys.includes(MODELS_CATALOGUE_V2_BETA_KEY)
		);
	},
});

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
