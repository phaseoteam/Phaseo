import { WebApiError } from "@/lib/web-api/client";
import { publicSWRFetcher } from "./publicFetcher";

describe("publicSWRFetcher", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("sends same-origin credentials for Vercel previews", async () => {
		const fetchMock = jest.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);
		global.fetch = fetchMock;
		const originalWindow = globalThis.window;
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: { hostname: "ai-stats-danielbutler1-ai-stats.vercel.app" },
			},
		});

		await publicSWRFetcher<{ ok: boolean }>("/api/_web/status");

		expect(fetchMock).toHaveBeenCalledWith("/api/_web/status", {
			headers: { Accept: "application/json" },
			credentials: "same-origin",
		});
		if (originalWindow === undefined) {
			Reflect.deleteProperty(globalThis, "window");
		} else {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: originalWindow,
			});
		}
	});

	it("fetches anonymous JSON from the shared SWR key", async () => {
		const fetchMock = jest.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);
		global.fetch = fetchMock;

		await expect(publicSWRFetcher<{ ok: boolean }>("/api/_web/status"))
			.resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledWith("/api/_web/status", {
			headers: { Accept: "application/json" },
			credentials: "omit",
		});
	});

	it("exposes the response status to the retry policy", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 404 }));

		await expect(publicSWRFetcher("/api/_web/missing")).rejects.toBeInstanceOf(
			WebApiError,
		);
		await expect(publicSWRFetcher("/api/_web/missing")).rejects.toMatchObject({
			status: 404,
		});
	});
});
