import { headers } from "next/headers";

export async function requestOrigin(): Promise<{
	cookie: string;
	origin: string;
}> {
	const requestHeaders = await headers();
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
	if (!host) {
		throw new Error("Unable to resolve request host for internal data fetch");
	}
	return {
		cookie: requestHeaders.get("cookie") ?? "",
		origin: `${proto}://${host}`,
	};
}

export function internalUrl(origin: string, path: string): URL {
	return new URL(path.startsWith("/") ? path : `/${path}`, origin);
}
