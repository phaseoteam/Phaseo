import { GET } from "@/app/api/favicon/route";

describe("favicon route", () => {
	it("serves one square, system-aware SVG at the stable base URL", async () => {
		const response = GET(new Request("https://phaseo.app/api/favicon"));
		const svg = await response.text();

		expect(response.headers.get("content-type")).toContain("image/svg+xml");
		expect(svg).toContain('width="64" height="64" viewBox="0 0 64 64"');
		expect(svg).toContain("@media (prefers-color-scheme: dark)");
	});

	it.each(["light", "dark"] as const)(
		"serves a cacheable explicit %s theme variant",
		async (theme) => {
			const response = GET(
				new Request(`https://phaseo.app/api/favicon?theme=${theme}`),
			);
			const svg = await response.text();

			expect(response.headers.get("cache-control")).toContain("max-age=3600");
			expect(svg).toContain(`${theme} favicon`);
			expect(svg).not.toContain("prefers-color-scheme");
		},
	);

	it("renders the canonical production variant as a black tile with a white mark", async () => {
		const previousEnvironment = process.env.VERCEL_ENV;
		process.env.VERCEL_ENV = "production";

		try {
			const response = GET(
				new Request("https://phaseo.app/api/favicon?theme=dark"),
			);
			const svg = await response.text();

			expect(svg).toContain('<rect fill="#050505"');
			expect(svg).toContain('<path fill="#ffffff"');
			expect(svg).not.toContain("rx=");
		} finally {
			if (previousEnvironment === undefined) {
				delete process.env.VERCEL_ENV;
			} else {
				process.env.VERCEL_ENV = previousEnvironment;
			}
		}
	});
});
