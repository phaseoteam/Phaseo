// Headers and cookies of the request being handled. Reads see the request the
// middleware forwarded (session-refreshed cookies, bearer token); writes add
// Set-Cookie headers to the response. Server only: the browser branches throw,
// which means a caller is missing its createServerFn wrapper.
import { createIsomorphicFn } from "@tanstack/react-start";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";
import { getCurrentRequest } from "@/compat/request-context";
import { parseCookieHeader, type CookieOptions, type CookieRecord } from "@/lib/http/cookies";

function requireRequest(): Request {
	const request = getCurrentRequest();
	if (!request) throw new Error("Request headers and cookies are only available while handling a request on the server.");
	return request;
}

/** Headers of the current request. */
export function currentRequestHeaders(): Headers {
	return requireRequest().headers;
}

/** Every cookie on the current request. */
export function currentRequestCookies(): CookieRecord[] {
	return parseCookieHeader(requireRequest().headers.get("cookie"));
}

/** One cookie on the current request. */
export function currentRequestCookie(name: string): string | undefined {
	return currentRequestCookies().find((cookie) => cookie.name === name)?.value;
}

/** Adds a Set-Cookie header to the current response. */
export const setResponseCookie = createIsomorphicFn()
	.server((name: string, value: string, options?: CookieOptions) => {
		setCookie(name, value, options as never);
	})
	.client((_name: string, _value: string, _options?: CookieOptions) => {
		throw new Error("setResponseCookie() was called in the browser. Move the caller into a createServerFn handler.");
	});

/** Expires a cookie on the current response. */
export const deleteResponseCookie = createIsomorphicFn()
	.server((name: string, options?: Pick<CookieOptions, "path" | "domain">) => {
		deleteCookie(name, options as never);
	})
	.client((_name: string, _options?: Pick<CookieOptions, "path" | "domain">) => {
		throw new Error("deleteResponseCookie() was called in the browser. Move the caller into a createServerFn handler.");
	});
