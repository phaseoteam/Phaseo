"use client";

import { useLayoutEffect } from "react";
import { useTheme } from "next-themes";

const FAVICON_BASE_URL = "/api/favicon";

function updateFavicon(href: string) {
	const links = Array.from(
		document.querySelectorAll<HTMLLinkElement>(
			'link[rel="icon"], link[rel="shortcut icon"]',
		),
	);
	let link = document.querySelector<HTMLLinkElement>("#phaseo-favicon");

	if (!link) {
		link = document.createElement("link");
		link.id = "phaseo-favicon";
		document.head.appendChild(link);
	}

	link.rel = "icon";
	link.type = "image/svg+xml";
	link.setAttribute("sizes", "any");
	link.href = href;

	for (const duplicate of links) {
		if (duplicate !== link) duplicate.remove();
	}
}

export default function ThemeAwareFavicon() {
	const { resolvedTheme } = useTheme();

	useLayoutEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
			return;
		}

		// Stable URLs let the browser reuse each variant instead of fetching on every toggle.
		updateFavicon(`${FAVICON_BASE_URL}?theme=${resolvedTheme}`);
	}, [resolvedTheme]);

	return null;
}
