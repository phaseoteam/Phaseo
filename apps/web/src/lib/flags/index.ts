import "server-only";

import { flag } from "flags/next";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getStatsigFlagsAdapter } from "@/lib/statsig/server";
import {
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
