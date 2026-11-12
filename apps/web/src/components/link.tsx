// Link on TanStack Router: a real <a href> that navigates client-side
// for same-origin links and preloads on intent.
import { useRouter } from "@tanstack/react-router";
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

type UrlObject = { pathname?: string | null; query?: Record<string, unknown> | string | null; hash?: string | null; search?: string | null };

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
	href: string | UrlObject;
	as?: string | UrlObject;
	replace?: boolean;
	scroll?: boolean;
	prefetch?: boolean | null | "auto";
	shallow?: boolean;
	locale?: string | false;
	legacyBehavior?: boolean;
	passHref?: boolean;
	onNavigate?: (event: { preventDefault(): void }) => void;
	children?: ReactNode;
};

export function formatHref(href: string | UrlObject): string {
	if (typeof href === "string") return href;
	const pathname = href.pathname ?? "";
	let search = href.search ?? "";
	if (!search && href.query) {
		if (typeof href.query === "string") search = href.query ? `?${href.query.replace(/^\?/, "")}` : "";
		else {
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(href.query)) {
				if (value === undefined || value === null) continue;
				if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
				else params.set(key, String(value));
			}
			const qs = params.toString();
			search = qs ? `?${qs}` : "";
		}
	}
	const hash = href.hash ? (href.hash.startsWith("#") ? href.hash : `#${href.hash}`) : "";
	return `${pathname}${search}${hash}`;
}

// Paths the request middleware proxies (docs, analytics, the web API) have no
// client route, so links to them load a new document.
const SERVER_ONLY_PATH = /^\/(?:docs|ingest|api)(?:[/?#]|$)/;

function isInternal(href: string): boolean {
	let pathname: string;
	if (href.startsWith("/") && !href.startsWith("//")) pathname = href;
	else {
		if (typeof window === "undefined") return false;
		try {
			const url = new URL(href, window.location.href);
			if (url.origin !== window.location.origin) return false;
			pathname = url.pathname;
		} catch {
			return false;
		}
	}
	return !SERVER_ONLY_PATH.test(pathname);
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
	{ href, as, replace, scroll, prefetch, shallow: _shallow, locale: _locale, legacyBehavior: _legacy, passHref: _passHref, onNavigate, onClick, onMouseEnter, onFocus, onTouchStart, target, children, ...rest },
	ref,
) {
	const router = useRouter();
	const resolved = formatHref(as ?? href);

	const preload = () => {
		if (prefetch === false || !isInternal(resolved)) return;
		try {
			void router.preloadRoute({ href: resolved } as never).catch(() => undefined);
		} catch {
			// Preloading is best effort.
		}
	};

	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		onClick?.(event);
		if (event.defaultPrevented) return;
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (target && target !== "_self") return;
		if (rest.download !== undefined) return;
		if (!isInternal(resolved)) return;
		let prevented = false;
		onNavigate?.({ preventDefault: () => { prevented = true; } });
		if (prevented) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		void router.navigate({ href: resolved, replace, resetScroll: scroll !== false });
	};

	return (
		<a
			ref={ref}
			href={resolved}
			target={target}
			onClick={handleClick}
			onMouseEnter={(event) => { onMouseEnter?.(event); preload(); }}
			onFocus={(event) => { onFocus?.(event); preload(); }}
			onTouchStart={(event) => { onTouchStart?.(event); preload(); }}
			{...rest}
		>
			{children}
		</a>
	);
});

export default Link;
