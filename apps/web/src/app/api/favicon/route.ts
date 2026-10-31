import { phaseoMarkPath } from "@phaseo/app-kit/logos";
import { NextResponse } from "next/server";

type FaviconEnvironment = "development" | "preview" | "production";
type FaviconTheme = "light" | "dark";

const faviconStyles: Record<
	FaviconEnvironment,
	{
		lightBackground: string;
		darkBackground: string;
		lightMark: string;
		darkMark: string;
		lightBadge: string;
		darkBadge: string;
		label: string;
	}
> = {
	development: {
		lightBackground: "#ff8800",
		darkBackground: "#ea580c",
		lightMark: "#ffffff",
		darkMark: "#ffffff",
		lightBadge: "#ffedd5",
		darkBadge: "#431407",
		label: "",
	},
	preview: {
		lightBackground: "#6d28d9",
		darkBackground: "#581c87",
		lightMark: "#ffffff",
		darkMark: "#ffffff",
		lightBadge: "#ede9fe",
		darkBadge: "#2e1065",
		label: "",
	},
	production: {
		lightBackground: "#ffffff",
		darkBackground: "#050505",
		lightMark: "#050505",
		darkMark: "#ffffff",
		lightBadge: "#e5e7eb",
		darkBadge: "#27272a",
		label: "",
	},
};

function resolveFaviconEnvironment(request: Request): FaviconEnvironment {
	const vercelEnvironment =
		process.env.VERCEL_ENV ?? process.env.PUBLIC_VERCEL_ENV;
	if (vercelEnvironment === "production") return "production";
	if (vercelEnvironment === "preview") return "preview";
	if (vercelEnvironment === "development") return "development";

	const host = request.headers.get("host")?.toLowerCase() ?? "";
	if (
		host.startsWith("localhost") ||
		host.startsWith("127.0.0.1") ||
		host.startsWith("[::1]")
	) {
		return "development";
	}
	if (host.endsWith(".vercel.app") || host.endsWith(".vercel.sh")) {
		return "preview";
	}

	return process.env.NODE_ENV === "development" ? "development" : "production";
}

function resolveFaviconTheme(request: Request): FaviconTheme | null {
	const theme = new URL(request.url).searchParams.get("theme");
	return theme === "light" || theme === "dark" ? theme : null;
}

function renderStaticFavicon(
	environment: FaviconEnvironment,
	theme: FaviconTheme,
): string {
	const style = faviconStyles[environment];
	const background =
		theme === "dark" ? style.darkBackground : style.lightBackground;
	const mark = theme === "dark" ? style.darkMark : style.lightMark;
	const badgeBackground =
		theme === "dark" ? style.darkBadge : style.lightBadge;
	const badge = style.label
		? `<circle fill="${badgeBackground}" cx="48" cy="48" r="11.5"/><text fill="${mark}" x="48" y="53" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800">${style.label}</text>`
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Phaseo ${environment} ${theme} favicon">
  <rect fill="${background}" width="64" height="64"/>
  <path fill="${mark}" d="${phaseoMarkPath}"/>
  ${badge}
</svg>`;
}

function renderSystemFavicon(environment: FaviconEnvironment): string {
	const style = faviconStyles[environment];
	const badge = style.label
		? `<circle class="badge" cx="48" cy="48" r="11.5"/><text class="badgeText" x="48" y="53" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800">${style.label}</text>`
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Phaseo ${environment} favicon">
  <style>
    .bg { fill: ${style.lightBackground}; }
    .mark { fill: ${style.lightMark}; }
    .badge { fill: ${style.lightBadge}; }
    .badgeText { fill: ${style.lightMark}; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: ${style.darkBackground}; }
      .mark { fill: ${style.darkMark}; }
      .badge { fill: ${style.darkBadge}; }
      .badgeText { fill: ${style.darkMark}; }
    }
  </style>
  <rect class="bg" width="64" height="64"/>
  <path class="mark" d="${phaseoMarkPath}"/>
  ${badge}
</svg>`;
}

export function GET(request: Request) {
	const environment = resolveFaviconEnvironment(request);
	const theme = resolveFaviconTheme(request);
	const cacheControl =
		environment === "development"
			? "no-store"
			: "public, max-age=3600, s-maxage=86400";

	return new NextResponse(
		theme
			? renderStaticFavicon(environment, theme)
			: renderSystemFavicon(environment),
		{
			headers: {
				"Cache-Control": cacheControl,
				"Content-Type": "image/svg+xml; charset=utf-8",
			},
		},
	);
}
