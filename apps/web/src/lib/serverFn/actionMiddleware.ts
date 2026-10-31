// Function middleware for the server functions that dashboard and auth forms
// call (create, update, delete and the reads that go with them).
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { refreshServerData } from "@/compat/refresh";

type RouterLike = {
	navigate(options: unknown): Promise<unknown>;
	resolveRedirect(redirect: unknown): { options: unknown };
};

function getRouter(): RouterLike | undefined {
	return (globalThis as { __phaseoRouter?: RouterLike }).__phaseoRouter;
}

/**
 * Logs unexpected errors on the server and sends the browser a generic
 * message, so upstream error text never reaches the client. `redirect()` and
 * `notFound()` pass through. Actions that need to show a reason return it.
 */
export const serverAction = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
	try {
		return await next();
	} catch (error) {
		if (isRedirect(error) || isNotFound(error)) throw error;
		console.error(`[server-action] ${serverFnMeta?.name ?? "unknown"} failed`, error);
		throw new Error("Server action failed");
	}
});

/**
 * A server action that changes data: once it succeeds, route loaders and
 * cached queries are read again so the page shows what was saved.
 */
export const serverMutation = createMiddleware({ type: "function" })
	.middleware([serverAction])
	.client(async ({ next }) => {
		const result = await next();
		void refreshServerData();
		return result;
	});

/**
 * A server action that ends with `redirect()`: the browser follows it with
 * the client router (external URLs load as a full page) and the call resolves
 * to undefined instead of rejecting.
 */
export const serverRedirectAction = createMiddleware({ type: "function" })
	.middleware([serverAction])
	.client(async (ctx) => {
		try {
			return await ctx.next();
		} catch (error) {
			if (!isRedirect(error)) throw error;
			const router = getRouter();
			if (router) await router.navigate(router.resolveRedirect(error).options);
			else window.location.assign(error.options.href ?? error.headers.get("Location") ?? "/");
			const { next: _next, ...rest } = ctx;
			// Resolve the call with no result, as if the handler returned nothing.
			return { ...rest, result: undefined } as never;
		}
	});
