import { getModelDetailsHref, getModelRouteSlug } from "./modelHref";

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
});
