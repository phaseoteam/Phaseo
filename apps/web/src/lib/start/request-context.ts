// The current request on the server (undefined in the browser). Built with
// createIsomorphicFn so the server branch never reaches browser bundles.
// The request middleware may substitute a session-refreshed request.
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requestOverride } from "./request-override";

export const getCurrentRequest = createIsomorphicFn()
	.server((): Request | undefined => {
		const override = requestOverride.getStore();
		if (override) return override;
		try {
			return getRequest();
		} catch {
			return undefined;
		}
	})
	.client((): Request | undefined => undefined);

export function getCurrentRequestUrl(): URL | undefined {
	const request = getCurrentRequest();
	return request ? new URL(request.url) : undefined;
}
