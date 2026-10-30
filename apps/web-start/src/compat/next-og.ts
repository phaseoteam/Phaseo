// `next/og` on @vercel/og's edge build (WASM resvg + satori), which runs on
// Workers. It is imported on first use so ordinary page requests never pay
// for initialising its WASM modules.
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

export class ImageResponse extends Response {
	constructor(element: ReactElement, options: ImageOptions = {}) {
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					const { ImageResponse: RealImageResponse } = await import("@vercel/og");
					const response = new RealImageResponse(element, options as never);
					const reader = response.body!.getReader();
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(value);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});
		const headers = new Headers({ "content-type": "image/png", "cache-control": "public, immutable, no-transform, max-age=31536000" });
		for (const [key, value] of new Headers(options.headers)) headers.set(key, value);
		super(body, { status: options.status ?? 200, statusText: options.statusText, headers });
	}
}
