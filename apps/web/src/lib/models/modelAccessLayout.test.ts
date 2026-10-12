import { getModelAccessLayout } from "./modelAccessLayout";

describe("subscription model access layout", () => {
	it.each([
		{ status: "Available" },
		{ status: "Announced" },
		{ status: "Available", hasProviderPreviews: true },
		{ status: "Announced", hasProviderPreviews: true },
	])("prioritizes subscriptions without API providers: %j", (options) => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: false, ...options }))
			.toEqual({ subscriptionOnly: true, showProviders: false });
	});

	it("keeps API providers visible for models with both access types", () => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: true }))
			.toEqual({ subscriptionOnly: false, showProviders: true });
	});

	it("preserves announced provider placeholders without subscriptions", () => {
		expect(getModelAccessLayout({ hasSubscriptions: false, hasApiProviders: false, status: "Announced" }))
			.toEqual({ subscriptionOnly: false, showProviders: true });
	});

	it("preserves private model provider access", () => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: true, isPrivateModel: true }))
			.toEqual({ subscriptionOnly: false, showProviders: true });
	});
});
