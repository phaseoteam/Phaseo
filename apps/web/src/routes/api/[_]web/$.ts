// On phaseo.app, Cloudflare routes /api/_web/* to the web API Worker before
// the site sees it. Elsewhere (workers.dev previews, local dev) forward it so
// browser-side catalogue queries keep working.
import { createFileRoute } from "@tanstack/react-router";

const WEB_API_ORIGIN = (process.env.WEB_API_ORIGIN ?? "https://phaseo.app").replace(/\/+$/, "");

async function forward({ request }: { request: Request }): Promise<Response> {
	const url = new URL(request.url);
	const target = `${WEB_API_ORIGIN}${url.pathname}${url.search}`;
	const headers = new Headers(request.headers);
	headers.delete("host");
	headers.delete("cookie");
	const upstream = await fetch(target, {
		method: request.method,
		headers,
		body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
		redirect: "manual",
	});
	const responseHeaders = new Headers(upstream.headers);
	responseHeaders.delete("set-cookie");
	return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const Route = createFileRoute("/api/_web/$")({
	server: { handlers: { GET: forward, HEAD: forward, POST: forward } },
});
