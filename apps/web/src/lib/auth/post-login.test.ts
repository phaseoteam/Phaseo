import { shouldRedirectToOnboardingAfterLogin } from "./post-login";

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
