import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { callGatewayControl, type GatewayResult } from "./gateway-control";

export async function callDataContributionGateway(args: {
	env: Env;
	request: Request;
	workspaceId: string;
	method?: string;
	path?: string;
	body?: unknown;
}): Promise<GatewayResult> {
	return callGatewayControl({
		...args,
		path: `/v1/data-contribution${args.path ?? ""}`,
		failureEvent: "data_contribution_gateway_proxy_failed",
	});
}

function proxyError(c: any, result: GatewayResult) {
	return c.json(result.payload, result.status as any, PRIVATE_NO_STORE_HEADERS);
}

export const accountSettingsDataContributionRouter = new Hono<{ Bindings: Env }>();

accountSettingsDataContributionRouter.put("/data-contribution", async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const result = await callDataContributionGateway({
		env: c.env,
		request: c.req.raw,
		workspaceId: String(body.workspaceId ?? ""),
		method: "PATCH",
		path: "/consent",
		body: { enabled: body.enabled, reason: body.reason },
	});
	if (result.status < 200 || result.status >= 300) return proxyError(c, result);
	return c.json({ ok: true, enabled: result.payload?.data?.enabled === true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDataContributionRouter.post("/data-contribution/classifiers", async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const result = await callDataContributionGateway({ env: c.env, request: c.req.raw, workspaceId: String(body.workspaceId ?? ""), method: "POST", path: "/classifiers", body });
	if (result.status < 200 || result.status >= 300) return proxyError(c, result);
	return c.json({ classifier: result.payload?.data ?? null }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDataContributionRouter.put("/data-contribution/classifiers/:id", async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const result = await callDataContributionGateway({
		env: c.env,
		request: c.req.raw,
		workspaceId: String(body.workspaceId ?? ""),
		method: "PATCH",
		path: `/classifiers/${encodeURIComponent(c.req.param("id"))}`,
		body,
	});
	if (result.status < 200 || result.status >= 300) return proxyError(c, result);
	return c.json({ classifier: result.payload?.data ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDataContributionRouter.delete("/data-contribution/classifiers/:id", async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const result = await callDataContributionGateway({
		env: c.env,
		request: c.req.raw,
		workspaceId: String(body.workspaceId ?? ""),
		method: "DELETE",
		path: `/classifiers/${encodeURIComponent(c.req.param("id"))}`,
	});
	if (result.status < 200 || result.status >= 300) return proxyError(c, result);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
