"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const FAVICON_BASE_URL = "/api/favicon";

function upsertFaviconLink(rel: string, href: string) {
	const selector = `link[rel="${rel}"][data-theme-aware-favicon="true"]`;
	let link = document.querySelector<HTMLLinkElement>(selector);

	if (!link) {
		link = document.createElement("link");
		link.rel = rel;
		link.type = "image/svg+xml";
		link.dataset.themeAwareFavicon = "true";
		if (rel === "icon") {
			link.setAttribute("sizes", "any");
		}
		document.head.appendChild(link);
	}

	link.href = href;
}

export default function ThemeAwareFavicon() {
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
			return;
		}

		const href = `${FAVICON_BASE_URL}?theme=${resolvedTheme}&v=${Date.now()}`;
		upsertFaviconLink("icon", href);
		upsertFaviconLink("shortcut icon", href);
	}, [resolvedTheme]);

	return null;
}
