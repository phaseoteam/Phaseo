import { NextResponse } from "next/server";

const MARK_PATH = "M19.8574 56H13V8H19.8574V56ZM31.7197 8C37.9368 8 42.8288 9.4856 46.3945 12.457C49.9601 15.4284 51.7432 19.5201 51.7432 24.7314C51.7432 29.9428 49.9601 34.0344 46.3945 37.0059C42.8288 39.9773 37.9368 41.4629 31.7197 41.4629H23.2852V35.4971H31.5146C35.8573 35.497 39.1714 34.5824 41.457 32.7539C43.7426 30.8796 44.8857 28.2056 44.8857 24.7314C44.8857 21.2572 43.7427 18.6059 41.457 16.7773C39.1714 14.9031 35.8573 13.9659 31.5146 13.9658H23.2852V8H31.7197Z";

function environmentStyle() {
	const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
	if (environment === "preview") return { light: "#6d28d9", dark: "#581c87", mark: "#fff" };
	if (environment === "development") return { light: "#ff8800", dark: "#ea580c", mark: "#fff" };
	return { light: "#fff", dark: "#050505", mark: "#050505" };
}

export function GET() {
	const style = environmentStyle();
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Phaseo favicon"><style>.bg{fill:${style.light}}.mark{fill:${style.mark}}@media(prefers-color-scheme:dark){.bg{fill:${style.dark}}.mark{fill:#fff}}</style><rect class="bg" width="64" height="64" rx="16"/><path class="mark" d="${MARK_PATH}"/></svg>`;
	return new NextResponse(svg, {
		headers: {
			"Cache-Control": environmentStyle().light === "#ff8800" ? "no-store" : "public, max-age=3600, s-maxage=86400",
			"Content-Type": "image/svg+xml; charset=utf-8",
		},
	});
}
