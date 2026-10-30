import {
	decodeModelRouteSegment,
	getModelDetailsHref,
	getModelRouteSlug,
} from "./modelHref";

describe("model href helpers", () => {
	it("uses the model id namespace for catalog routes", () => {
		expect(getModelDetailsHref("mistral", "mistralai/mistral-nemo")).toBe(
			"/models/mistralai/mistral-nemo",
		);
		expect(getModelRouteSlug("mistralai/mistral-nemo", "mistral")).toBe(
			"mistral-nemo",
		);
	});

	it("falls back to the organisation id for un-namespaced model ids", () => {
		expect(getModelDetailsHref("openai", "gpt-5.4")).toBe(
			"/models/openai/gpt-5.4",
		);
		expect(getModelRouteSlug("gpt-5.4", "openai")).toBe("gpt-5.4");
	});

	it("returns null when a route cannot be built", () => {
		expect(getModelDetailsHref(null, "gpt-5.4")).toBeNull();
		expect(getModelDetailsHref("openai", null)).toBeNull();
		expect(getModelRouteSlug("", "openai")).toBe("");
	});

	it("decodes encoded free-variant route segments exactly once", () => {
		expect(decodeModelRouteSegment("laguna-s-2.1%3Afree")).toBe(
			"laguna-s-2.1:free",
		);
		expect(decodeModelRouteSegment("laguna-s-2.1:free")).toBe(
			"laguna-s-2.1:free",
		);
		expect(decodeModelRouteSegment("invalid%segment")).toBe(
			"invalid%segment",
		);
	});

	it("encodes nested model slugs as one route segment", () => {
		const href = getModelDetailsHref(null, "openrouter/meta-llama/llama-3.1-8b:free");

		expect(href).toBe(
			"/models/openrouter/meta-llama%2Fllama-3.1-8b%3Afree",
		);
		expect(href).not.toBe("/models/openrouter/meta-llama/llama-3.1-8b:free");
	});
});
