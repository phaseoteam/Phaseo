// Open Graph images rendered with @vercel/og's edge build (WASM resvg + satori), which runs on
// Workers. It is imported on first use so ordinary page requests never pay
// for initialising its WASM modules. The PNG is rendered in full before the
// response is returned: images are small (tens of KB), and a body that only
// starts producing after the handler returns can be cut off.
import type { ReactElement } from "react";

type ImageOptions = {
	width?: number;
	height?: number;
	emoji?: string;
	fonts?: Array<{ name: string; data: ArrayBuffer; weight?: number; style?: string }>;
	debug?: boolean;
	status?: number;
	statusText?: string;
	headers?: HeadersInit;
};

export async function renderImageResponse(element: ReactElement, options: ImageOptions = {}): Promise<Response> {
	const { ImageResponse } = await import("@vercel/og");
	let png: ArrayBuffer;
	try {
		png = await new ImageResponse(element, options as never).arrayBuffer();
	} catch (error) {
		console.error("OG image render failed:", error instanceof Error ? error.stack : error);
		return new Response("OG image render failed", { status: 500, headers: { "cache-control": "no-store" } });
	}
	const headers = new Headers({ "content-type": "image/png", "cache-control": "public, immutable, no-transform, max-age=31536000" });
	for (const [key, value] of new Headers(options.headers)) headers.set(key, value);
	return new Response(png, { status: options.status ?? 200, statusText: options.statusText, headers });
}
