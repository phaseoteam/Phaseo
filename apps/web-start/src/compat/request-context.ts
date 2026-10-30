// The current request on the server (undefined in the browser). Built with
// createIsomorphicFn so the server branch never reaches browser bundles.
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const getCurrentRequest = createIsomorphicFn()
	.server((): Request | undefined => {
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
