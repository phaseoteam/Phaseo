import { describe, expect, it } from "vitest";
import { withApiKeyHeaderAsBearer } from "./api-key-header";

const KEY = "phaseo_v1_sk_KIDAPIKEYHDR_secret";

describe("withApiKeyHeaderAsBearer", () => {
	it("sends an x-api-key gateway key as the bearer credential", async () => {
		const original = new Request("https://api.phaseo.app/v1/messages", {
			method: "POST",
			headers: { "x-api-key": ` ${KEY} `, "anthropic-version": "2023-06-01", "content-type": "application/json" },
			body: JSON.stringify({ model: "anthropic/claude-sonnet-4.6", max_tokens: 16 }),
		});
		const mapped = withApiKeyHeaderAsBearer(original);
		expect(mapped.headers.get("authorization")).toBe(`Bearer ${KEY}`);
		expect(mapped.headers.has("x-api-key")).toBe(false);
		expect(mapped.headers.get("anthropic-version")).toBe("2023-06-01");
		expect(mapped.method).toBe("POST");
		expect(mapped.url).toBe("https://api.phaseo.app/v1/messages");
		expect(await mapped.json()).toEqual({ model: "anthropic/claude-sonnet-4.6", max_tokens: 16 });
	});

	it("keeps the Authorization header when a client sends both", () => {
		const original = new Request("https://api.phaseo.app/v1/messages", {
			method: "POST",
			headers: { authorization: `Bearer ${KEY}`, "x-api-key": "sk-ant-other" },
		});
		expect(withApiKeyHeaderAsBearer(original)).toBe(original);
	});

	it.each([
		["outside /v1", "https://api.phaseo.app/oauth/token", KEY],
		["with an empty x-api-key", "https://api.phaseo.app/v1/messages", "  "],
	])("leaves requests %s unchanged", (_label, url, key) => {
		const original = new Request(url, { method: "POST", headers: { "x-api-key": key } });
		expect(withApiKeyHeaderAsBearer(original)).toBe(original);
	});

	it("leaves requests without x-api-key unchanged", () => {
		const original = new Request("https://api.phaseo.app/v1/models");
		expect(withApiKeyHeaderAsBearer(original)).toBe(original);
	});
});
