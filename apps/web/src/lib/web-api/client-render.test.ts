import { createElement } from "react";
import { fetchPublicWebApi, fetchOptionalPublicWebApi } from "./client";

// Use React's real Server Component cache and Next's installed RSC renderer.
// The default Node export intentionally does not memoize outside an RSC render.
jest.mock("react", () => {
	const path = jest.requireActual<typeof import("node:path")>("node:path");
	return jest.requireActual(path.join(path.dirname(require.resolve("react/package.json")), "cjs/react.react-server.development.js"));
});

const { renderToReadableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node") as {
	renderToReadableStream: (model: unknown, manifest: object, options: { onError: (error: unknown) => string }) => Promise<ReadableStream>;
};

async function render(read: () => Promise<unknown>) {
	async function Component() {
		await read();
		return null;
	}
	const errors: unknown[] = [];
	const stream = await renderToReadableStream(createElement(Component), {}, {
		onError: error => { errors.push(error); return "test-render-error"; },
	});
	await new Response(stream).text();
	if (errors.length) throw errors[0];
}

afterEach(() => {
	jest.restoreAllMocks();
	Reflect.deleteProperty(globalThis, "window");
});

test("deduplicates concurrent and later public reads, but starts fresh on the next render", async () => {
	const network = jest.spyOn(global, "fetch").mockImplementation(async () => Response.json({ model: { name: "GPT" } }));
	const read = async () => {
		const [metadata, page] = await Promise.all([
			fetchPublicWebApi("/api/_web/models/openai%2Fgpt"),
			fetchPublicWebApi("/api/_web/models/openai%2Fgpt", { signal: undefined }),
		]);
		expect(metadata).toEqual({ model: { name: "GPT" } });
		expect(page).toBe(metadata);
		expect(await fetchOptionalPublicWebApi("/api/_web/models/openai%2Fgpt")).toBe(metadata);
	};
	await render(read);
	expect(network).toHaveBeenCalledTimes(1);
	await render(read);
	expect(network).toHaveBeenCalledTimes(2);
});

test("keeps paths and query projections distinct", async () => {
	const network = jest.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await render(async () => Promise.all([
		fetchPublicWebApi("/api/_web/models?projection=cards"),
		fetchPublicWebApi("/api/_web/models?projection=detail"),
		fetchPublicWebApi("/api/_web/benchmarks"),
	]));
	expect(network).toHaveBeenCalledTimes(3);
});

test("shares optional 404 reads within the render and retries on a later render", async () => {
	const network = jest.spyOn(global, "fetch").mockImplementation(async () => new Response(null, { status: 404 }));
	const read = async () => {
		expect(await Promise.all([
			fetchOptionalPublicWebApi("/api/_web/models/missing"),
			fetchOptionalPublicWebApi("/api/_web/models/missing"),
		])).toEqual([null, null]);
	};
	await render(read);
	expect(network).toHaveBeenCalledTimes(1);
	await render(read);
	expect(network).toHaveBeenCalledTimes(2);
});

test("shares upstream failures within a render without retaining them on the next request", async () => {
	const network = jest.spyOn(global, "fetch")
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValueOnce(Response.json({ models: [] }));
	await render(async () => {
		await expect(fetchPublicWebApi("/api/_web/models")).rejects.toMatchObject({ status: 503 });
		await expect(fetchPublicWebApi("/api/_web/models")).rejects.toMatchObject({ status: 503 });
	});
	expect(network).toHaveBeenCalledTimes(1);
	await render(async () => {
		await expect(fetchPublicWebApi("/api/_web/models")).resolves.toEqual({ models: [] });
	});
	expect(network).toHaveBeenCalledTimes(2);
});

test("keeps a caller's aborted request separate from a shared public read", async () => {
	const network = jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
		init?.signal?.throwIfAborted();
		return Response.json({ models: [] });
	});
	const controller = new AbortController();
	controller.abort();
	await render(async () => {
		await expect(fetchPublicWebApi("/api/_web/models", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
		await expect(fetchPublicWebApi("/api/_web/models")).resolves.toEqual({ models: [] });
		await expect(fetchPublicWebApi("/api/_web/models")).resolves.toEqual({ models: [] });
	});
	expect(network).toHaveBeenCalledTimes(2);
});

test("does not memoize credentialed reads", async () => {
	const network = jest.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await render(async () => Promise.all([
		fetchPublicWebApi("/api/_web/models", { credentials: "same-origin" }),
		fetchPublicWebApi("/api/_web/models", { credentials: "same-origin" }),
		fetchPublicWebApi("/api/_web/models"),
	]));
	expect(network).toHaveBeenCalledTimes(3);
});

test("keeps browser revalidation independent even in a render context", async () => {
	Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
	const network = jest.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await render(async () => Promise.all([
		fetchPublicWebApi("/api/_web/models"),
		fetchPublicWebApi("/api/_web/models"),
	]));
	expect(network).toHaveBeenCalledTimes(2);
	expect(network.mock.calls.every(([url]) => url === "/api/_web/models")).toBe(true);
});
