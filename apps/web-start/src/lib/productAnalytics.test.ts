import {
	PRODUCT_ANALYTICS_EVENT,
	captureProductEvent,
	type ProductAnalyticsPayload,
} from "./productAnalytics";

describe("captureProductEvent", () => {
	it("is a no-op during server rendering", () => {
		expect(() =>
			captureProductEvent("onboarding_finished", {
				completed_step_count: 3,
				outcome: "completed",
			}),
		).not.toThrow();
	});

	it("dispatches a typed browser event without identifiers or free text", () => {
		const browserWindow = new EventTarget();
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: browserWindow,
		});

		let received: ProductAnalyticsPayload | null = null;
		browserWindow.addEventListener(PRODUCT_ANALYTICS_EVENT, (event) => {
			received = (event as CustomEvent<ProductAnalyticsPayload>).detail;
		});

		captureProductEvent("api_key_created", {
			preset: "production",
			surface: "settings",
		});

		expect(received).toEqual({
			event: "api_key_created",
			properties: {
				preset: "production",
				surface: "settings",
			},
		});

		Reflect.deleteProperty(globalThis, "window");
	});
});
