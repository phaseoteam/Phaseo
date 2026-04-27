import "server-only";

import { connection } from "next/server";

import { gatewayHeroVariantExperiment, gatewayNewHeroFlag } from "@/lib/flags";
import { identify } from "@/lib/flags/identify";
import { getServerStatsigProfile } from "@/lib/statsig/server";
import {
	NEW_GATEWAY_HERO_GATE,
	isBetaFeatureEnabled,
	type GatewayHeroVariant,
} from "@/lib/statsig/shared";

export async function getGatewayHeroVariant(): Promise<GatewayHeroVariant> {
	await connection();

	const profile = await getServerStatsigProfile((await identify()).userID);

	if (isBetaFeatureEnabled(profile, NEW_GATEWAY_HERO_GATE)) {
		return "experimental";
	}

	const experimentVariant =
		(await gatewayHeroVariantExperiment()) as GatewayHeroVariant;
	if (experimentVariant === "experimental") {
		return "experimental";
	}

	return (await gatewayNewHeroFlag()) ? "experimental" : "classic";
}
