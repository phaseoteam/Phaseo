// Server side of `"use server"` modules: runs a registered export only.
import { isNotFound, isRedirect } from "@tanstack/react-router";
// eslint-disable-next-line import/no-unresolved -- provided by the phaseo:server-actions Vite plugin.
import { actionModules } from "virtual:phaseo-server-action-registry";

function decodeArgs(form: FormData): unknown[] {
	const raw = form.get("__phaseo_args");
	const encoded = typeof raw === "string" ? (JSON.parse(raw) as unknown[]) : [];
	return encoded.map((arg, index) => {
		if (arg && typeof arg === "object" && "$formData" in arg) {
			const data = new FormData();
			const prefix = `__fd${index}:`;
			for (const [key, value] of form.entries()) if (key.startsWith(prefix)) data.append(key.slice(prefix.length), value);
			return data;
		}
		if (arg && typeof arg === "object" && "$undefined" in arg) return undefined;
		return arg;
	});
}

function sameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return false;
	try {
		return new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
}

export async function handleServerAction(request: Request): Promise<Response> {
	if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
	if (!sameOrigin(request) || request.headers.get("x-phaseo-action") !== "1") {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	const id = new URL(request.url).searchParams.get("id") ?? "";
	const hash = id.lastIndexOf("#");
	const moduleKey = id.slice(0, hash);
	const exportName = id.slice(hash + 1);
	const load = (actionModules as Record<string, () => Promise<Record<string, unknown>>>)[moduleKey];
	if (hash <= 0 || !load) return Response.json({ error: "Unknown action" }, { status: 404 });
	const mod = await load();
	const fn = mod[exportName];
	if (typeof fn !== "function") return Response.json({ error: "Unknown action" }, { status: 404 });
	const args = decodeArgs(await request.formData());
	try {
		const result = await (fn as (...a: unknown[]) => unknown)(...args);
		return Response.json({ result: result ?? null }, { headers: { "cache-control": "no-store" } });
	} catch (error) {
		if (isRedirect(error)) {
			const options = (error as { options?: { href?: string; to?: string } }).options;
			const href = options?.href ?? options?.to ?? (error as Response).headers?.get?.("location") ?? "/";
			return Response.json({ redirect: href }, { headers: { "cache-control": "no-store" } });
		}
		if (isNotFound(error)) return Response.json({ notFound: true, error: "Not found" }, { status: 404 });
		console.error(`[server-action] ${moduleKey}#${exportName} failed`, error);
		return Response.json({ error: "Server action failed" }, { status: 500 });
	}
}
