import { WebApiError } from "@/lib/web-api/client";
import { publicFetcher } from "./publicFetcher";

describe("publicFetcher", () => {
	const originalFetch = global.fetch;
	const originalOrigin = process.env.WEB_API_ORIGIN;

	beforeEach(() => {
		process.env.WEB_API_ORIGIN = "https://phaseo.app";
	});

	afterEach(() => {
		global.fetch = originalFetch;
		if (originalOrigin === undefined) delete process.env.WEB_API_ORIGIN;
		else process.env.WEB_API_ORIGIN = originalOrigin;
	});

	it("fetches anonymous JSON from a public query path", async () => {
		const fetchMock = jest.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);
		global.fetch = fetchMock;

		await expect(publicFetcher<{ ok: boolean }>("/api/_web/status"))
			.resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledWith("https://phaseo.app/api/_web/status", {
			headers: { Accept: "application/json" },
			cache: "no-store",
			signal: undefined,
			credentials: "omit",
		});
	});

	it("exposes the response status to the retry policy", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 404 }));

		await expect(publicFetcher("/api/_web/missing")).rejects.toBeInstanceOf(
			WebApiError,
		);
		await expect(publicFetcher("/api/_web/missing")).rejects.toMatchObject({
			status: 404,
		});
	});
});
