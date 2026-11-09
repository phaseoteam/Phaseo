// TanStack Start instance: global request middleware (site rules, locale
// negotiation, session refresh and proxies; see lib/start/requestMiddleware.ts).
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { phaseoRequestMiddleware } from "@/lib/start/requestMiddleware";

// Server functions are same-origin POST endpoints: refuse cross-site calls
// (Sec-Fetch-Site, then Origin, then Referer). Page and API routes are not affected.
const serverFnCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
	requestMiddleware: [serverFnCsrfMiddleware, phaseoRequestMiddleware],
}));
