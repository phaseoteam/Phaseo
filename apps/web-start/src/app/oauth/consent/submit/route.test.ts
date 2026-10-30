import { POST } from "./route";

describe("OAuth consent submission route", () => {
	it("rejects cross-origin submissions before processing consent", async () => {
		const response = await POST(new Request("https://phaseo.app/oauth/consent/submit", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://attacker.example",
			},
			body: JSON.stringify({ operation: "approve" }),
		}));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "Invalid request origin" });
	});

	it("keeps same-origin responses private and rejects unsupported operations", async () => {
		const response = await POST(new Request("https://phaseo.app/oauth/consent/submit", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://phaseo.app",
			},
			body: JSON.stringify({ operation: "unknown" }),
		}));

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ error: "Unsupported consent operation" });
	});
});
