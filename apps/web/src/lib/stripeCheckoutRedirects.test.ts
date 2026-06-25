import {
	buildStripeCheckoutRedirectUrls,
	resolveStripeCheckoutBaseUrl,
} from "./stripeCheckoutRedirects";

describe("stripe checkout redirects", () => {
	it("uses the configured base URL when present", () => {
		const baseUrl = resolveStripeCheckoutBaseUrl({
			configuredBaseUrl: "https://billing.example.com",
			originHeader: "https://ignored.example.com",
			refererHeader: "https://ignored.example.com/settings/credits",
		});

		expect(baseUrl).toBe("https://billing.example.com");
	});

	it("falls back to the referer origin instead of using the full referer URL", () => {
		const redirects = buildStripeCheckoutRedirectUrls({
			refererHeader: "https://app.example.com/settings/credits?dialog=top-up",
			kind: "pay_and_save",
			paymentAttempt: 123456,
		});

		expect(redirects.baseUrl).toBe("https://app.example.com");
		expect(redirects.settingsCreditsUrl).toBe(
			"https://app.example.com/settings/credits",
		);
		expect(redirects.successUrl).toBe(
			"https://app.example.com/settings/credits?checkout=success&kind=pay_and_save&payment_attempt=123456",
		);
		expect(redirects.cancelUrl).toBe(
			"https://app.example.com/settings/credits?checkout=cancelled",
		);
	});

	it("falls back to localhost when no valid origin information is available", () => {
		const redirects = buildStripeCheckoutRedirectUrls({
			originHeader: "not-a-url",
			refererHeader: "",
			kind: "save_only",
		});

		expect(redirects.successUrl).toBe(
			"http://localhost:3000/settings/credits?checkout=success&kind=save_only",
		);
		expect(redirects.cancelUrl).toBe(
			"http://localhost:3000/settings/credits?checkout=cancelled",
		);
	});
});
