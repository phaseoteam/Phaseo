// The old auth pages (/sign-in, /sign-up, /sign-in/enterprise, /error, /auth/verify-mfa)
// are now steps of the site-wide auth dialog. Their URLs stay valid, because emails,
// bookmarks, OAuth callbacks and server redirects of protected pages use them: each
// redirects in beforeLoad to the home page with `?auth=<step>`, which opens the dialog
// over it (AuthDialog). A URL hash (Supabase error details) survives the redirect.
import { redirect } from "@tanstack/react-router";
import { defaultLocale, isPublicLocale } from "@/i18n/routing";

type RedirectInput = {
	params: Record<string, string | undefined>;
	search: Record<string, unknown>;
};

export type AuthDialogRedirectParams = {
	auth: "sign-in" | "sign-up" | "sso" | "mfa" | "reset" | "error";
	returnUrl?: string;
	notice?: "check-email" | "auth-failed";
	code?: string;
	message?: string;
};

export function searchValue(search: Record<string, unknown>, key: string): string | undefined {
	const value = search[key];
	if (typeof value === "string") return value;
	if (Array.isArray(value) && typeof value[0] === "string") return value[0];
	// TanStack parses numeric-looking values; return URLs and codes are always strings.
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

/** The home page in the route's locale (technical routes carry it as ?locale=) with the dialog's parameters. */
export function authDialogHref({ params, search }: RedirectInput, dialog: AuthDialogRedirectParams): string {
	const locale = [params.locale, searchValue(search, "locale")].find(
		(value): value is string => typeof value === "string" && isPublicLocale(value),
	);
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(dialog)) {
		if (value) query.set(key, value);
	}
	const home = locale && locale !== defaultLocale ? `/${locale}` : "/";
	return `${home}?${query.toString()}`;
}

/** beforeLoad for an old auth page: redirect to the home page with the dialog open. */
export function redirectToAuthDialog(build: (search: Record<string, unknown>) => AuthDialogRedirectParams) {
	return (input: RedirectInput): never => {
		throw redirect({ href: authDialogHref(input, build(input.search)), statusCode: 307 });
	};
}
