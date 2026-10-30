import {
	defaultLocale,
	isPublicLocale,
	type PublicLocale,
} from "@/i18n/routing";

export function resolveAuthLocale(value: unknown): PublicLocale {
	return typeof value === "string" && isPublicLocale(value)
		? value
		: defaultLocale;
}

export function readAuthLocale(formData: FormData): PublicLocale {
	return resolveAuthLocale(formData.get("locale"));
}

export function localizeAuthPath(
	locale: PublicLocale,
	pathname: string,
): string {
	const normalizedPathname = pathname.startsWith("/")
		? pathname
		: `/${pathname}`;

	return locale === defaultLocale
		? normalizedPathname
		: `/${locale}${normalizedPathname}`;
}

/** Prefix a public catalogue path for every locale except the default locale. */
export function localizePublicPath(
	locale: PublicLocale,
	pathname: string,
): string {
	const normalizedPathname = pathname.startsWith("/")
		? pathname
		: `/${pathname}`;

	return locale === defaultLocale
		? normalizedPathname
		: `/${locale}${normalizedPathname}`;
}

export function buildLocalizedAuthPath(
	locale: PublicLocale,
	pathname: string,
	params: Record<string, string | undefined> = {},
): string {
	const url = new URL(localizeAuthPath(locale, pathname), "http://localhost");
	for (const [key, value] of Object.entries(params)) {
		if (value) url.searchParams.set(key, value);
	}
	return `${url.pathname}${url.search}`;
}

/**
 * Technical auth routes stay unprefixed. Carry the UI locale in a validated
 * query parameter so callback, recovery, and MFA hand-offs can return to the
 * correct localized auth surface.
 */
export function withAuthLocale(
	pathname: string,
	locale: PublicLocale,
): string {
	const url = new URL(pathname, "http://localhost");
	url.searchParams.set("locale", locale);
	return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveAuthLocaleFromUrl(url: URL): PublicLocale {
	return resolveAuthLocale(url.searchParams.get("locale"));
}
