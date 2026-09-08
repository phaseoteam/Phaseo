import { describe, expect, it } from "vitest";
import app from "@/index";

describe("private model account routes", () => {
	it.each(["/api/account/private-models", "/api/account/private-models/catalog"])("mounts %s behind authentication", async (path) => {
		const response = await app.request(`https://phaseo.app${path}`, {}, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});
});
