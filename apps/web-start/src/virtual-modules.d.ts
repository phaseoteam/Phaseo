// Modules the Vite plugins in build/phaseo-plugins.ts and the Workers runtime provide.
declare module "virtual:phaseo-server-action-registry" {
	export const actionModules: Record<string, () => Promise<Record<string, unknown>>>;
}

declare module "virtual:phaseo-announcement-mdx" {
	export const announcementModules: Record<string, () => Promise<Record<string, unknown>>>;
}

declare module "cloudflare:workers" {
	export const env: Record<string, unknown> & { ASSETS: { fetch(request: Request): Promise<Response> } };
	export function waitUntil(promise: Promise<unknown>): void;
}

// Next's per-request fetch cache options; Workers ignores unknown init fields.
interface RequestInit {
	next?: { revalidate?: number | false; tags?: string[] };
	cf?: { cacheTtl?: number; cacheEverything?: boolean };
}
