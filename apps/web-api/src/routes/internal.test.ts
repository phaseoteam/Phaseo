import { describe, expect, it } from "vitest";
import app from "@/index";

describe("internal Worker boundaries", () => {
	it("keeps compatibility validation admin-only and private", async () => {
		const response = await app.request("https://phaseo.app/api/internal/compatibility/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "openai.responses", payload: {} }) }, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("keeps provider review decisions admin-only", async () => {
		const response = await app.request("https://phaseo.app/api/internal/provider-catalog/reviews", {}, { ENV: "development" });
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("keeps model discovery review decisions admin-only", async () => {
		const response = await app.request("https://phaseo.app/api/internal/model-discovery/reviews", {}, { ENV: "development" });
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("keeps provider probes and promotions admin-only", async () => {
		const probe = await app.request("https://phaseo.app/api/internal/provider-catalog/candidates/run-1/models/acme%2Fatlas/probe", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ passed: true, summary: {} }) }, { ENV: "development" });
		const promote = await app.request("https://phaseo.app/api/internal/provider-catalog/candidates/run-1/models/acme%2Fatlas/promote", { method: "POST" }, { ENV: "development" });
		expect(probe.status).toBe(403);
		expect(promote.status).toBe(403);
	});
});
