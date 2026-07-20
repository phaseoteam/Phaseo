import { describe, expect, it } from "vitest";
import app from "@/index";

describe("watcher execution boundary", () => {
	it("rejects manual watcher runs without the operations secret", async () => {
		const response = await app.request("https://phaseo.app/api/internal/watchers/web", { method: "POST" }, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("rejects unknown watcher names before execution", async () => {
		const response = await app.request("https://phaseo.app/api/internal/watchers/unknown", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		}, { ENV: "development", REVALIDATION_SECRET: "test-secret" });
		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
