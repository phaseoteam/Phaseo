// Modules the Vite plugins in vite/plugins.ts and the Workers runtime provide.
declare module "virtual:phaseo-announcement-mdx" {
	export const announcementModules: Record<string, () => Promise<Record<string, unknown>>>;
}

declare module "cloudflare:workers" {
	export const env: Record<string, unknown> & { ASSETS: { fetch(request: Request): Promise<Response> } };
	export function waitUntil(promise: Promise<unknown>): void;
}

// Cloudflare's per-request cache options for outgoing fetches.
interface RequestInit {
	cf?: { cacheTtl?: number; cacheEverything?: boolean };
}
