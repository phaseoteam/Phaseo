// The document shell: html, head and the providers every page shares (see RootDocument).
import appCss from "@/styles/globals.css?url";
import fontsCss from "@/components/layout/fonts.css?url";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router";
import { RootDocument } from "@/components/layout/RootDocument";
import { GlobalError } from "@/components/layout/GlobalError";
import { RouteNotFound } from "@/components/layout/RouteBoundaries";
import { metadataToHead, notFoundMetadata } from "@/lib/start/metadataToHead";
import { StreamedMetadata } from "@/lib/start/streamedMetadata";
import { defaultLocale, getLocaleDefinition, isPublicLocale, type PublicLocale } from "@/i18n/locales";

export function localeFromPathname(pathname: string): PublicLocale {
	const first = pathname.split("/")[1] ?? "";
	return isPublicLocale(first) ? first : defaultLocale;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	head: ({ match }) => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			// The root is the not-found boundary for unknown locales and unmatched
			// paths, which are titled from their not-found metadata and never indexed.
			...(match.error ? metadataToHead(notFoundMetadata(match) ?? { title: "404: Page not found", robots: { index: false, follow: false } }, { root: true }).meta : []),
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "stylesheet", href: fontsCss },
		],
	}),
	component: RootComponent,
	notFoundComponent: RouteNotFound,
	// Only failures in the shell itself reach this; pages have their own boundary.
	errorComponent: GlobalError,
});

function RootComponent() {
	const pathname = useLocation({ select: (location) => location.pathname });
	const locale = localeFromPathname(pathname);
	const definition = getLocaleDefinition(locale);
	return (
		<RootDocument locale={locale} direction={definition.dir} fontProfile={definition.font}>
			<StreamedMetadata />
			<Outlet />
		</RootDocument>
	);
}
