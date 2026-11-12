// Test helper: call a server route's handler the way the router does.
type RouteParams = Record<string, string>;
type HandlerContext = { params?: RouteParams | Promise<RouteParams> };
type ServerHandler = (ctx: { request: Request; params: RouteParams; pathname: string; context: Record<string, unknown> }) => Response | Promise<Response>;
type ServerRoute = { options: { server?: { handlers?: Record<string, ServerHandler> | ((...args: never[]) => unknown) } } };

/** `handler(request, { params })` for one HTTP method of a file route with `server.handlers`. */
export function serverRouteHandler(route: unknown, method: string) {
	const handlers = (route as ServerRoute).options.server?.handlers;
	const handler = typeof handlers === "object" ? handlers?.[method] : undefined;
	if (!handler) throw new Error(`route has no ${method} handler`);
	return async (request: Request = new Request("https://phaseo.app/"), context: HandlerContext = {}): Promise<Response> => {
		const params = (await context.params) ?? {};
		return handler({ request, params, pathname: new URL(request.url).pathname, context: {} });
	};
}
