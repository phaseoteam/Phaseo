const LANDING_PAGE_PATHS = {
	home: "/",
	models: "/models",
	chat: "/chat",
	monitor: "/monitor",
} as const;

export function resolvePostLoginDestination(opts: {
	returnUrl: string;
	landingPage: unknown;
	showOnboarding: boolean;
}) {
	if (opts.showOnboarding) return "/onboarding";
	if (opts.returnUrl !== "/") return opts.returnUrl;
	return LANDING_PAGE_PATHS[opts.landingPage as keyof typeof LANDING_PAGE_PATHS] ?? "/";
}
