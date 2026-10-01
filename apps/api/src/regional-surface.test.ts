import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { enforceRegionalSurface } from "./regional-surface";

function app() {
	const testApp = new Hono<Env>();
	testApp.use("*", enforceRegionalSurface);
	testApp.all("*", (c) => c.json({ ok: true }));
	return testApp;
}

describe("regional Worker surface", () => {
	it.each([
		["GET", "/v1/health"],
		["GET", "/v1/models"],
		["POST", "/v1/chat/completions"],
		["POST", "/v1/responses"],
		["POST", "/v1/messages"],
	])("allows %s %s", async (method, path) => {
		const response = await app().request(`https://eu.api.phaseo.app${path}`, { method }, {
			GATEWAY_ROUTING_REGION: "eu",
		} as Env["Bindings"]);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-phaseo-gateway-region")).toBe("eu");
	});

	it.each([
		["POST", "/v1/files"],
		["POST", "/v1/images/generations"],
		["GET", "/v1/models/openai/gpt-5/endpoints"],
		["POST", "/internal/jobs"],
	])("blocks %s %s", async (method, path) => {
		const response = await app().request(`https://eu.api.phaseo.app${path}`, { method }, {
			GATEWAY_ROUTING_REGION: "eu",
		} as Env["Bindings"]);
		expect(response.status).toBe(404);
		expect(response.headers.get("x-phaseo-gateway-region")).toBe("eu");
		await expect(response.json()).resolves.toMatchObject({
			error: "regional_endpoint_not_supported",
			gateway_region: "eu",
		});
	});

	it("does not restrict the global deployment", async () => {
		const response = await app().request("https://api.phaseo.app/v1/files", { method: "POST" }, {} as Env["Bindings"]);
		expect(response.status).toBe(200);
	});
});
