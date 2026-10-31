// `next/navigation` on TanStack Router. Components keep their Next imports;
// Vite aliases `next/navigation` to this module.
import {
	notFound as tanstackNotFound,
	redirect as tanstackRedirect,
	useLocation,
	useParams as useTanstackParams,
	useRouter as useTanstackRouter,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { refreshServerData } from "./refresh";

export class ReadonlyURLSearchParams extends URLSearchParams {}

export type AppRouterInstance = {
	push(href: string, options?: { scroll?: boolean }): void;
	replace(href: string, options?: { scroll?: boolean }): void;
	back(): void;
	forward(): void;
	refresh(): void;
	prefetch(href: string): void;
};

export function useRouter(): AppRouterInstance {
	const router = useTanstackRouter();
	return useMemo(
		() => ({
			push: (href, options) => void router.navigate({ href, resetScroll: options?.scroll !== false }),
			replace: (href, options) => void router.navigate({ href, replace: true, resetScroll: options?.scroll !== false }),
			back: () => router.history.back(),
			forward: () => router.history.forward(),
			refresh: () => void refreshServerData(router),
			prefetch: (href) => {
				try {
					void router.preloadRoute({ href } as never).catch(() => undefined);
				} catch {
					// Preloading is best effort.
				}
			},
		}),
		[router],
	);
}

export function usePathname(): string {
	return useLocation({ select: (location) => location.pathname });
}

export function useSearchParams(): ReadonlyURLSearchParams {
	const searchStr = useLocation({ select: (location) => location.searchStr });
	return useMemo(() => new ReadonlyURLSearchParams(searchStr), [searchStr]);
}

export function useParams<T extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>>(): T {
	const params = useTanstackParams({ strict: false }) as Record<string, unknown>;
	return useMemo(() => {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(params)) {
			// Catch-all segments are `_splat` in TanStack and string arrays in Next.
			if (key === "_splat") out.slug = typeof value === "string" ? value.split("/").filter(Boolean) : value;
			else out[key] = value;
		}
		return out as T;
	}, [params]);
}

export function useSelectedLayoutSegments(): string[] {
	return usePathname().split("/").filter(Boolean);
}

export function useSelectedLayoutSegment(): string | null {
	return useSelectedLayoutSegments()[0] ?? null;
}

export function notFound(): never {
	throw tanstackNotFound();
}

export enum RedirectType {
	push = "push",
	replace = "replace",
}

export function redirect(href: string, _type?: RedirectType): never {
	throw tanstackRedirect({ href, statusCode: 307 });
}

export function permanentRedirect(href: string, _type?: RedirectType): never {
	throw tanstackRedirect({ href, statusCode: 308 });
}

export function unstable_rethrow(error: unknown): void {
	if (error && typeof error === "object" && ("isNotFound" in error || "isRedirect" in error || error instanceof Response)) throw error;
}
