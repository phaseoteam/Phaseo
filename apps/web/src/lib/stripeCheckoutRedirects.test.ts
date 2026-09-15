import {
	buildStripeCheckoutRedirectUrls,
	resolveConfiguredStripeCheckoutBaseUrl,
	resolveStripeCheckoutBaseUrl,
} from "./stripeCheckoutRedirects";

describe("stripe checkout redirects", () => {
	it("uses the canonical public website URL for checkout", () => {
		expect(resolveConfiguredStripeCheckoutBaseUrl({
			NEXT_PUBLIC_WEBSITE_URL: "https://phaseo.app/",
			WEBSITE_URL: "https://internal.example.com",
		})).toBe("https://phaseo.app");
	});

	it("falls back to the server website URL when the public URL is absent or invalid", () => {
		expect(resolveConfiguredStripeCheckoutBaseUrl({
			NEXT_PUBLIC_WEBSITE_URL: "",
			WEBSITE_URL: "https://phaseo.app/settings",
		})).toBe("https://phaseo.app");
	});

	it("rejects missing or non-HTTP website URLs", () => {
		expect(resolveConfiguredStripeCheckoutBaseUrl({
			NEXT_PUBLIC_WEBSITE_URL: "javascript:alert(1)",
			WEBSITE_URL: "not-a-url",
		})).toBeNull();
	});

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
			allowRequestHeaderFallback: true,
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

	it("does not trust request headers unless explicitly enabled for local development", () => {
		expect(resolveStripeCheckoutBaseUrl({
			originHeader: "https://attacker.example",
			refererHeader: "https://attacker.example/settings/credits",
		})).toBe("http://localhost:3000");
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
