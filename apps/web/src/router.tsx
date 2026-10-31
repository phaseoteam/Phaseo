import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createWebQueryClient } from "@/lib/query/queryClient";
import { RouteErrorBoundary, RouteNotFound } from "@/components/layout/RouteBoundaries";
import { parseSearchAsStrings, stringifySearchFromStrings } from "@/lib/start/nextPage";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = createWebQueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: RouteErrorBoundary,
		defaultNotFoundComponent: RouteNotFound,
		// Pages read search params as Next did: raw strings, repeated keys as arrays.
		parseSearch: parseSearchAsStrings,
		stringifySearch: stringifySearchFromStrings,
	});
	// Queries fetched during server rendering stream to the browser, so
	// components using useSuspenseQuery do not refetch on hydration.
	setupRouterSsrQueryIntegration({ router, queryClient });
	if (typeof window !== "undefined") {
		// Server actions refresh or redirect through the active router.
		(globalThis as { __phaseoRouter?: typeof router }).__phaseoRouter = router;
		// refresh() and server actions re-read server data the way Next re-renders it.
		(globalThis as { __phaseoQueryClient?: typeof queryClient }).__phaseoQueryClient = queryClient;
	}
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
