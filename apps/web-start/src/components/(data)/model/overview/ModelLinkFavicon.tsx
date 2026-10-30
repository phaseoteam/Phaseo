"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const FAVICON_OWNER_SUBDOMAINS = new Set([
	"docs",
	"documentation",
	"developer",
	"developers",
	"help",
	"support",
]);

function getOwnerHostname(hostname: string) {
	const parts = hostname.replace(/^www\./, "").split(".");
	const [subdomain] = parts;
	if (parts.length <= 2 || !FAVICON_OWNER_SUBDOMAINS.has(subdomain ?? "")) {
		return parts.join(".");
	}
	return parts.slice(1).join(".");
}

function getFaviconHostnames(url: string) {
	try {
		const exactHostname = new URL(url).hostname.replace(/^www\./, "");
		const ownerHostname = getOwnerHostname(exactHostname);
		return Array.from(new Set([exactHostname, ownerHostname].filter(Boolean)));
	} catch {
		return [];
	}
}

function getGoogleFaviconUrl(hostname: string) {
	return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}

export default function ModelLinkFavicon({
	url,
	fallback,
}: {
	url: string;
	fallback: ReactNode;
}) {
	const faviconUrls = useMemo(
		() => getFaviconHostnames(url).map(getGoogleFaviconUrl),
		[url],
	);
	const [faviconIndex, setFaviconIndex] = useState(0);
	const faviconUrl = faviconUrls[faviconIndex];

	if (!faviconUrl) {
		return <>{fallback}</>;
	}

	return (
		// Favicons come from a third-party proxy, so do not route them through next/image's host allowlist.
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={faviconUrl}
			alt=""
			width="24"
			height="24"
			className="h-6 w-6 rounded-sm"
			loading="lazy"
			decoding="async"
			referrerPolicy="no-referrer"
			onError={() => setFaviconIndex((index) => index + 1)}
		/>
	);
}
