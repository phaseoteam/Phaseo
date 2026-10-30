// Run Next.js route handlers (`route.ts` exports GET/POST/...) as TanStack
// Start server route handlers.
import { NextRequest } from "next/server";
import { toNextParams } from "./nextPage";

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];
type NextHandler = (request: NextRequest, context: { params: Promise<Record<string, string | string[] | undefined>> }) => Response | Promise<Response>;
type StartHandler = (ctx: { request: Request; params: Record<string, unknown> }) => Promise<Response>;

export function nextRouteHandlers(mod: Record<string, unknown>, options: { splatName?: string; localized?: boolean } = {}): Partial<Record<Method, StartHandler>> {
	const handlers: Partial<Record<Method, StartHandler>> = {};
	for (const method of METHODS) {
		const handler = mod[method];
		if (typeof handler !== "function") continue;
		handlers[method] = async ({ request, params }) => {
			const nextParams = toNextParams(params, options.splatName);
			if (!options.localized) delete nextParams.locale;
			return (handler as NextHandler)(NextRequest.from(request), { params: Promise.resolve(nextParams) });
		};
	}
	return handlers;
}
