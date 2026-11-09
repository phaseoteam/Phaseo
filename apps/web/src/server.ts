// Worker entry: the rollout canary (lib/start/canary.ts) decides whether this
// site answers or the request passes through to the previous site, then
// TanStack Start handles everything served here.
import { createServerEntry, createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { decideCanary, markResponse } from "@/lib/start/canary";

const startFetch = createStartHandler(defaultStreamHandler);

export default createServerEntry({
	async fetch(request, opts) {
		const decision = decideCanary(request, process.env);
		if (decision.target === "control") return decision.response;
		if (decision.target === "previous") {
			// On the phaseo.app route this goes to the origin (the previous
			// site), not back into this Worker.
			return markResponse(await fetch(request), "previous", decision.setCookies);
		}
		const response = await startFetch(request, opts);
		return markResponse(response, "this", decision.setCookies);
	},
});
