import { describe, expect, it } from "vitest";
import app from "@/index";

describe("internal Worker boundaries", () => {
	it("keeps compatibility validation admin-only and private", async () => {
		const response = await app.request("https://phaseo.app/api/internal/compatibility/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "openai.responses", payload: {} }) }, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
