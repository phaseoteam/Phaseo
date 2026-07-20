import { describe, expect, it } from "vitest";
import app from "@/index";

describe("chat issue Worker boundary", () => {
	it("returns a private prefilled issue URL when the reporter is anonymous", async () => {
		const response = await app.request("https://phaseo.app/api/account/chat/issues", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				error: { modelId: "openai/gpt-test", endpoint: "/responses", message: "failed" },
			}),
		}, { ENV: "development" });
		expect(response.status).toBe(200);
		const payload = await response.json() as { created?: boolean; issueUrl?: string };
		expect(payload.created).toBe(false);
		expect(payload.issueUrl).toContain("github.com/phaseoteam/Phaseo/issues/new");
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
