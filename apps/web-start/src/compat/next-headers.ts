// `next/headers` on the current request (server only).
import { setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getCurrentRequest } from "./request-context";

type CookieOptions = { path?: string; domain?: string; maxAge?: number; expires?: Date; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" | boolean };

function requireRequest(): Request {
	const request = getCurrentRequest();
	if (!request) throw new Error("next/headers is only available while handling a request on the server.");
	return request;
}

function parseCookies(header: string | null): Array<{ name: string; value: string }> {
	if (!header) return [];
	return header.split(/;\s*/).flatMap((part) => {
		const eq = part.indexOf("=");
		if (eq <= 0) return [];
		const raw = part.slice(eq + 1).trim();
		let value = raw;
		try {
			value = decodeURIComponent(raw);
		} catch {
			// Keep the raw value.
		}
		return [{ name: part.slice(0, eq).trim(), value }];
	});
}

export async function headers(): Promise<Headers> {
	return new Headers(requireRequest().headers);
}

export async function cookies() {
	const request = requireRequest();
	const all = parseCookies(request.headers.get("cookie"));
	return {
		// Read from the (possibly session-refreshed) current request, not the raw one.
		get(name: string) {
			return all.find((c) => c.name === name);
		},
		getAll(name?: string) {
			return name ? all.filter((c) => c.name === name) : all;
		},
		has(name: string) {
			return all.some((c) => c.name === name);
		},
		set(nameOrOptions: string | (CookieOptions & { name: string; value: string }), value?: string, options?: CookieOptions) {
			if (typeof nameOrOptions === "string") setCookie(nameOrOptions, value ?? "", options as never);
			else {
				const { name, value: v, ...rest } = nameOrOptions;
				setCookie(name, v, rest as never);
			}
		},
		delete(name: string | { name: string; path?: string; domain?: string }) {
			const opts = typeof name === "string" ? { name } : name;
			deleteCookie(opts.name, { path: opts.path, domain: opts.domain } as never);
		},
		toString() {
			return request.headers.get("cookie") ?? "";
		},
	};
}

export async function draftMode() {
	return { isEnabled: false, enable() {}, disable() {} };
}
