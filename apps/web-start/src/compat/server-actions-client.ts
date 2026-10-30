// Browser side of `"use server"` modules (see build/phaseo-plugins.ts).
// Arguments travel as multipart form data so `FormData` arguments from
// `<form action={fn}>` survive, next to JSON for everything else.

import { refreshServerData } from "./refresh";

type RouterLike = { navigate(options: { href: string; replace?: boolean }): Promise<unknown>; invalidate(): Promise<unknown> };

export const SERVER_ACTION_ENDPOINT = "/api/server-actions";

function getRouter(): RouterLike | undefined {
	return (globalThis as { __phaseoRouter?: RouterLike }).__phaseoRouter;
}

export function encodeServerActionArgs(args: unknown[]): FormData {
	const body = new FormData();
	const encoded = args.map((arg, index) => {
		if (typeof FormData !== "undefined" && arg instanceof FormData) {
			for (const [key, value] of arg.entries()) body.append(`__fd${index}:${key}`, value);
			return { $formData: index };
		}
		return arg === undefined ? { $undefined: true } : arg;
	});
	body.append("__phaseo_args", JSON.stringify(encoded));
	return body;
}

export function createServerActionReference(moduleKey: string, exportName: string) {
	const action = async (...args: unknown[]) => {
		const response = await fetch(`${SERVER_ACTION_ENDPOINT}?id=${encodeURIComponent(`${moduleKey}#${exportName}`)}`, {
			method: "POST",
			body: encodeServerActionArgs(args),
			headers: { "x-phaseo-action": "1" },
			credentials: "same-origin",
		});
		let payload: { result?: unknown; redirect?: string; error?: string; notFound?: boolean } = {};
		try {
			payload = await response.json();
		} catch {
			throw new Error(`Server action ${exportName} failed (${response.status}).`);
		}
		if (payload.redirect) {
			const router = getRouter();
			if (router) await router.navigate({ href: payload.redirect });
			else window.location.assign(payload.redirect);
			return undefined;
		}
		if (!response.ok || payload.error) throw new Error(payload.error ?? `Server action ${exportName} failed (${response.status}).`);
		// Next refreshes the page's server data after an action; do the same.
		void refreshServerData(getRouter());
		return payload.result;
	};
	Object.defineProperty(action, "name", { value: exportName });
	return action;
}
