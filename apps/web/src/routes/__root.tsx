// Next: app/[locale]/layout.tsx + components/layout/RootDocument.tsx.
import appCss from "@/app/globals.css?url";
import fontsCss from "@/components/layout/fonts.css?url";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router";
import { RootDocument } from "@/components/layout/RootDocument";
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
			// paths; Next titled that page from its not-found metadata.
			...(match.error ? metadataToHead(notFoundMetadata(match) ?? { title: "404: Page not found" }, { root: true }).meta : []),
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "stylesheet", href: fontsCss },
		],
	}),
	component: RootComponent,
	notFoundComponent: RouteNotFound,
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
