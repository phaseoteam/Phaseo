import { shouldRedirectToOnboardingAfterLogin } from "./post-login-onboarding";
import { resolvePostLoginDestination } from "./post-login-landing";

describe("shouldRedirectToOnboardingAfterLogin", () => {
	it("shows onboarding for newly-created personal workspaces without completion", () => {
		expect(
			shouldRedirectToOnboardingAfterLogin({
				returnUrl: "/",
				onboardingComplete: false,
				createdPersonalTeam: true,
			}),
		).toBe(true);
	});

	it("shows onboarding for newly-created personal workspaces when completion status is unavailable", () => {
		expect(
			shouldRedirectToOnboardingAfterLogin({
				returnUrl: "/",
				onboardingComplete: null,
				createdPersonalTeam: true,
			}),
		).toBe(true);
	});

	it("does not show onboarding to existing users with no completion timestamp", () => {
		expect(
			shouldRedirectToOnboardingAfterLogin({
				returnUrl: "/",
				onboardingComplete: false,
				createdPersonalTeam: false,
			}),
		).toBe(false);
	});

	it("does not override explicit return URLs", () => {
		expect(
			shouldRedirectToOnboardingAfterLogin({
				returnUrl: "/settings/keys",
				onboardingComplete: false,
				createdPersonalTeam: true,
			}),
		).toBe(false);
	});

	it("does not show onboarding after completion", () => {
		expect(
			shouldRedirectToOnboardingAfterLogin({
				returnUrl: "/",
				onboardingComplete: true,
				createdPersonalTeam: true,
			}),
		).toBe(false);
	});
});

describe("resolvePostLoginDestination", () => {
	it("uses the saved landing page for ordinary sign-ins", () => {
		expect(resolvePostLoginDestination({
			returnUrl: "/",
			landingPage: "models",
			showOnboarding: false,
		})).toBe("/models");
	});

	it("preserves explicit return URLs", () => {
		expect(resolvePostLoginDestination({
			returnUrl: "/settings/keys",
			landingPage: "chat",
			showOnboarding: false,
		})).toBe("/settings/keys");
	});

	it("keeps onboarding ahead of the saved landing page", () => {
		expect(resolvePostLoginDestination({
			returnUrl: "/",
			landingPage: "monitor",
			showOnboarding: true,
		})).toBe("/onboarding");
	});

	it("falls back home for unrecognised stored values", () => {
		expect(resolvePostLoginDestination({
			returnUrl: "/",
			landingPage: "external-url",
			showOnboarding: false,
		})).toBe("/");
	});
});
