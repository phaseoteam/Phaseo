// Next: app/[locale]/layout.tsx + components/layout/RootDocument.tsx.
import "@/app/globals.css";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router";
import { RootDocument } from "@/components/layout/RootDocument";
import { RouteNotFound } from "@/components/layout/RouteBoundaries";
import { defaultLocale, getLocaleDefinition, isPublicLocale, type PublicLocale } from "@/i18n/locales";

export function localeFromPathname(pathname: string): PublicLocale {
	const first = pathname.split("/")[1] ?? "";
	return isPublicLocale(first) ? first : defaultLocale;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	head: () => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }],
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
			<Outlet />
		</RootDocument>
	);
}
