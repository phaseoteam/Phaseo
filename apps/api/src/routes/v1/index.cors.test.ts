import { describe, expect, it } from "vitest";
import { v1Router } from "./index";

function exposedHeaders(response: Response): string[] {
	return (response.headers.get("Access-Control-Expose-Headers") ?? "")
		.split(",")
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean);
}

describe("v1 CORS", () => {
	it("lets browser clients read the gateway's dropped-parameter notice", async () => {
		const preflight = await v1Router.request("/chat/completions", {
			method: "OPTIONS",
			headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "POST" },
		});

		expect(preflight.status).toBe(204);
		expect(exposedHeaders(preflight)).toContain("x-phaseo-dropped-params");
		expect(exposedHeaders(preflight)).toContain("x-request-id");
	});

	it("exposes it on the actual response, which is where browsers read the list", async () => {
		// Any /v1 response gets the same CORS headers; an unknown route needs no runtime.
		const response = await v1Router.request(
			"/no-such-route",
			{ method: "GET", headers: { Origin: "https://app.example.com" } },
			{},
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(exposedHeaders(response)).toContain("x-phaseo-dropped-params");
	});
});
