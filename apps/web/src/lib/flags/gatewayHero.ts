import type { GatewayHeroVariant } from "@/lib/statsig/shared";

export async function getGatewayHeroVariant(): Promise<GatewayHeroVariant> {
	return "experimental";
}
