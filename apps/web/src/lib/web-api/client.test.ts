import {
	fetchAccountWebApi,
	fetchOptionalPublicWebApi,
	fetchPublicWebApi,
} from "./client";

describe("Cloudflare web API client", () => {
	const originalOrigin = process.env.WEB_API_ORIGIN;

	afterEach(() => {
		jest.restoreAllMocks();
		if (originalOrigin === undefined) delete process.env.WEB_API_ORIGIN;
		else process.env.WEB_API_ORIGIN = originalOrigin;
	});

	it("uses the configured Worker origin without enabling the Next data cache", async () => {
		process.env.WEB_API_ORIGIN = "http://127.0.0.1:8788/";
		const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ organisations: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		await expect(
			fetchPublicWebApi<{ organisations: unknown[] }>(
				"/api/_web/organisations",
			),
		).resolves.toEqual({ organisations: [] });
		expect(fetchMock).toHaveBeenCalledWith(
			"http://127.0.0.1:8788/api/_web/organisations",
			{
				headers: { Accept: "application/json" },
				cache: "no-store",
			},
		);
	});

	it("returns null only for optional resources that are not found", async () => {
		jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

		await expect(
			fetchOptionalPublicWebApi("/api/_web/families/missing"),
		).resolves.toBeNull();
	});

	it("surfaces non-404 Worker failures", async () => {
		jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

		await expect(fetchPublicWebApi("/api/_web/benchmarks")).rejects.toEqual(
			expect.objectContaining({ status: 503 }),
		);
	});

	it("sends account requests with bearer auth and no shared cache", async () => {
		process.env.WEB_API_ORIGIN = "https://preview.example.com";
		const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ initialBalance: 12.5 }), { status: 200 }),
		);

		await expect(fetchAccountWebApi(
			"/api/account/credits/balance?workspaceId=workspace-1",
			"session-token",
		)).resolves.toEqual({ initialBalance: 12.5 });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://preview.example.com/api/account/credits/balance?workspaceId=workspace-1",
			{
				headers: {
					Accept: "application/json",
					Authorization: "Bearer session-token",
				},
				cache: "no-store",
			},
		);
	});
});
