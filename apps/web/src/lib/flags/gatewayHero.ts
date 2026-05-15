import "server-only";

import { connection } from "next/server";

import type { GatewayHeroVariant } from "@/lib/statsig/shared";

export async function getGatewayHeroVariant(): Promise<GatewayHeroVariant> {
	await connection();
	return "experimental";
}
