// `next/cache`. web-start has no Next data cache: freshness comes from the
// web API's own Cloudflare caching, and server actions refresh the page by
// invalidating the router after they finish (see server-actions plugin).
type AnyFn = (...args: never[]) => unknown;

export function revalidatePath(_path: string, _type?: "page" | "layout"): void {}
export function revalidateTag(_tag: string, _profile?: unknown): void {}
export function updateTag(_tag: string): void {}
export function refresh(): void {}
export function cacheLife(_profile: unknown): void {}
export function cacheTag(..._tags: string[]): void {}
export function unstable_noStore(): void {}
export const noStore = unstable_noStore;
export async function io(): Promise<void> {}

export function unstable_cache<T extends AnyFn>(fn: T, _keyParts?: string[], _options?: { revalidate?: number | false; tags?: string[] }): T {
	return fn;
}
