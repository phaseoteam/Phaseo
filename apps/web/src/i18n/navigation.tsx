// Locale-aware navigation on TanStack Router: the default locale has no URL
// prefix, every other public locale does.
import { redirect as tanstackRedirect, useLocation, useRouter as useTanstackRouter } from "@tanstack/react-router";
import { forwardRef, useMemo } from "react";
import { useLocale } from "@/i18n/react";
import NextLink, { formatHref, type LinkProps as NextLinkProps } from "@/components/link";
import { refreshServerData } from "@/lib/start/refresh";
import { defaultLocale, isPublicLocale, publicLocales, type PublicLocale } from "./locales";

type Href = NextLinkProps["href"];

function isExternal(path: string): boolean {
	return /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.startsWith("#");
}

/** Strip a leading public-locale segment: `/fr-FR/models` → `/models`. */
export function stripLocale(pathname: string): string {
	const segments = pathname.split("/");
	if (isPublicLocale(segments[1] ?? "")) {
		const rest = `/${segments.slice(2).join("/")}`;
		return rest === "/" || rest === "" ? "/" : rest.replace(/\/$/, "") || "/";
	}
	return pathname || "/";
}

export function localizeHref(href: string, locale: string): string {
	if (isExternal(href) || !href.startsWith("/")) return href;
	const bare = stripLocale(href.split(/[?#]/)[0] ?? "/");
	const suffix = href.slice((href.split(/[?#]/)[0] ?? "").length);
	if (!isPublicLocale(locale) || locale === defaultLocale) return `${bare}${suffix}`;
	return `${bare === "/" ? `/${locale}` : `/${locale}${bare}`}${suffix}`;
}

export function getPathname({ href, locale }: { href: Href; locale: string }): string {
	return localizeHref(formatHref(href), locale);
}

/**
 * Remember an explicit locale switch (the same cookie the request middleware
 * way). The request middleware negotiates unprefixed paths from this cookie,
 * so without it switching to the default locale would bounce back on reload.
 */
function rememberLocale(locale: string | undefined, current: string) {
	if (!locale || locale === current || !isPublicLocale(locale) || typeof document === "undefined") return;
	document.cookie = `PHASEO_LOCALE=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export type LinkProps = Omit<NextLinkProps, "locale"> & { locale?: string };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function LocaleLink({ href, locale, onClick, ...rest }, ref) {
	const current = useLocale();
	const target = localizeHref(formatHref(href), locale ?? current);
	return (
		<NextLink
			ref={ref}
			href={target}
			hrefLang={locale && locale !== current ? locale : undefined}
			onClick={(event) => {
				rememberLocale(locale, current);
				onClick?.(event);
			}}
			{...rest}
		/>
	);
});

export function usePathname(): string {
	const pathname = useLocation({ select: (location) => location.pathname });
	return stripLocale(pathname);
}

type NavigateOptions = { locale?: string; scroll?: boolean };

export function useRouter() {
	const router = useTanstackRouter();
	const current = useLocale();
	return useMemo(() => {
		const to = (href: Href, options?: NavigateOptions) => localizeHref(formatHref(href), options?.locale ?? current);
		return {
			push: (href: Href, options?: NavigateOptions) => {
				rememberLocale(options?.locale, current);
				void router.navigate({ href: to(href, options), resetScroll: options?.scroll !== false });
			},
			replace: (href: Href, options?: NavigateOptions) => {
				rememberLocale(options?.locale, current);
				void router.navigate({ href: to(href, options), replace: true, resetScroll: options?.scroll !== false });
			},
			prefetch: (href: Href, options?: NavigateOptions) => {
				try {
					void router.preloadRoute({ href: to(href, options) } as never).catch(() => undefined);
				} catch {
					// Preloading is best effort.
				}
			},
			back: () => router.history.back(),
			forward: () => router.history.forward(),
			refresh: () => void refreshServerData(router),
		};
	}, [router, current]);
}

type RedirectArg = Href | { href: Href; locale?: string; forcePrefix?: boolean };

function resolveRedirect(arg: RedirectArg): string {
	if (typeof arg === "object" && arg !== null && "href" in arg) {
		const locale = arg.locale ?? defaultLocale;
		return localizeHref(formatHref(arg.href), locale);
	}
	return formatHref(arg as Href);
}

export function redirect(arg: RedirectArg): never {
	throw tanstackRedirect({ href: resolveRedirect(arg), statusCode: 307 });
}

export function permanentRedirect(arg: RedirectArg): never {
	throw tanstackRedirect({ href: resolveRedirect(arg), statusCode: 308 });
}

export const locales: readonly PublicLocale[] = publicLocales;
