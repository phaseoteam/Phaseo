// TanStack Start instance: global request middleware replaces Next's
// next.config.mjs headers/redirects/rewrites and src/proxy.ts.
import { createStart } from "@tanstack/react-start";
import { phaseoRequestMiddleware } from "@/lib/start/requestMiddleware";

export const startInstance = createStart(() => ({
	requestMiddleware: [phaseoRequestMiddleware],
}));
