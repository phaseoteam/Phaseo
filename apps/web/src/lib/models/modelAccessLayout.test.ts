import { getModelAccessLayout } from "./modelAccessLayout";

describe("subscription model access layout", () => {
	it.each([
		{ status: "Available" },
		{ status: "Announced" },
		{ status: "Available", hasProviderPreviews: true },
		{ status: "Announced", hasProviderPreviews: true },
	])("prioritizes subscriptions without API providers: %j", (options) => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: false, ...options }))
			.toMatchObject({ subscriptionOnly: true, showProviders: false });
	});

	it("keeps API providers visible for models with both access types", () => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: true }))
			.toMatchObject({ subscriptionOnly: false, showProviders: true });
	});

	it("preserves announced provider placeholders without subscriptions", () => {
		expect(getModelAccessLayout({ hasSubscriptions: false, hasApiProviders: false, status: "Announced" }))
			.toMatchObject({ subscriptionOnly: false, showProviders: true });
	});

	it("preserves private model provider access", () => {
		expect(getModelAccessLayout({ hasSubscriptions: true, hasApiProviders: true, isPrivateModel: true }))
			.toMatchObject({ subscriptionOnly: false, showProviders: true });
	});
});


describe("API actions during subscription lookup failures", () => {
	it("hides actions when subscription access is unknown and no providers are known", () => {
		expect(getModelAccessLayout({ hasSubscriptions: null, hasApiProviders: false })).toMatchObject({ canUseApi: false });
	});
	it("keeps actions for verified API providers even when subscriptions are unknown", () => {
		expect(getModelAccessLayout({ hasSubscriptions: null, hasApiProviders: true })).toMatchObject({ canUseApi: true });
	});
	it("distinguishes an empty subscription response from a failed lookup", () => {
		expect(getModelAccessLayout({ hasSubscriptions: false, hasApiProviders: false })).toMatchObject({ canUseApi: true });
	});
});
