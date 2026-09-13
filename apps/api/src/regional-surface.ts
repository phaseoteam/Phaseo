import type { MiddlewareHandler } from "hono";
import type { Env } from "@/runtime/types";
import { normalizeGatewayRoutingRegion } from "@pipeline/before/deployment-region";

const REGIONAL_ROUTES = new Map<string, ReadonlySet<string>>([
	["/", new Set(["GET"])],
	["/v1/health", new Set(["GET"])],
	["/v1/models", new Set(["GET"])],
	["/v1/chat/completions", new Set(["POST"])],
	["/v1/responses", new Set(["POST"])],
	["/v1/messages", new Set(["POST"])],
]);

export const enforceRegionalSurface: MiddlewareHandler<Env> = async (c, next) => {
	const region = normalizeGatewayRoutingRegion(c.env.GATEWAY_ROUTING_REGION);
	if (!region || c.req.method === "OPTIONS") {
		await next();
		return;
	}

	const allowedMethods = REGIONAL_ROUTES.get(c.req.path);
	if (allowedMethods?.has(c.req.method)) {
		c.header("X-Phaseo-Gateway-Region", region);
		await next();
		return;
	}

	return c.json({
		ok: false,
		error: "regional_endpoint_not_supported",
		message:
			"Regional gateways currently support text-only Chat Completions, Responses, and Messages requests, plus model discovery and health checks.",
		gateway_region: region,
	}, 404, { "X-Phaseo-Gateway-Region": region });
};
