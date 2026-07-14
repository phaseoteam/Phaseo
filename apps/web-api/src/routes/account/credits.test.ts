import { describe, expect, it } from "vitest";
import app from "@/index";

describe("account credit routes", () => {
	it("rejects unauthenticated balance reads and marks them private", async () => {
		const response = await app.request("https://phaseo.app/api/account/credits/balance?workspaceId=workspace-1", {}, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("vary")).toBe("Authorization, Cookie");
	});
});
