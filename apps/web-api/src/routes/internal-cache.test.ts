import { describe, expect, it } from "vitest";
import app from "@/index";

const env = { ENV: "development" as const };

describe("internal cache control routes", () => {
	it.each([
		["GET", "https://phaseo.app/api/internal/cache"],
		["POST", "https://phaseo.app/api/internal/cache/purge"],
	] as const)("keeps %s %s private and admin-only", async (method, url) => {
		const response = await app.request(url, { method }, env);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("vary")).toContain("Authorization");
	});

	it.each([
		["GET", "https://phaseo.app/api/internal/cache"],
		["POST", "https://phaseo.app/api/internal/cache/purge"],
	] as const)("rejects cross-site browser access to %s %s before auth", async (method, url) => {
		const response = await app.request(url, {
			method,
			headers: { "Sec-Fetch-Site": "cross-site" },
		}, env);
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({ error: "cross_site_request_blocked" });
	});
});
