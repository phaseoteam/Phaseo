// Redirect-only Next pages called redirect() while rendering, which Next
// turned into a response. TanStack needs the redirect before render, so these
// routes redirect in beforeLoad instead.
import { redirect } from "@tanstack/react-router";

type RedirectInput = {
	params: Record<string, string | undefined>;
	search: Record<string, unknown>;
};

/** Prefix an internal path with the route's locale (unprefixed is en-GB). */
function localize(locale: string | undefined, href: string): string {
	if (!locale || !href.startsWith("/") || href.startsWith("//")) return href;
	if (href === `/${locale}` || href.startsWith(`/${locale}/`) || href.startsWith(`/${locale}?`) || href.startsWith(`/${locale}#`)) return href;
	return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

export function redirectBeforeLoad(kind: "temporary" | "permanent", target: (input: RedirectInput) => string) {
	return (input: RedirectInput): never => {
		throw redirect({
			href: localize(input.params.locale, target(input)),
			statusCode: kind === "permanent" ? 308 : 307,
		});
	};
}

export function searchString(search: Record<string, unknown>, key: string): string | undefined {
	const value = search[key];
	return typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}
