export function shouldRedirectToOnboardingAfterLogin(opts: {
	returnUrl: string;
	onboardingComplete: boolean | null;
	createdPersonalTeam: boolean;
}) {
	return (
		opts.returnUrl === "/" &&
		opts.createdPersonalTeam &&
		opts.onboardingComplete !== true
	);
}
