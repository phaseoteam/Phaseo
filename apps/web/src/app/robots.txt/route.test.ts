import { publicLocales } from "@/i18n/routing";
import { GET } from "./route";

async function robotsBody(): Promise<string> {
	const response = await GET();
	expect(response.status).toBe(200);
	return response.text();
}

describe("robots.txt", () => {
	it("disallows private pages under every locale prefix", async () => {
		const body = await robotsBody();
		// Slashless prefixes, so section roots such as /de-DE/settings match too.
		for (const path of ["/sign-in", "/sign-up", "/settings", "/internal", "/gateway/usage"]) {
			expect(body).toContain(`Disallow: ${path}\n`);
			for (const locale of publicLocales) {
				expect(body).toContain(`Disallow: /${locale}${path}\n`);
			}
		}
	});

	it("keeps route handler paths unprefixed", async () => {
		const body = await robotsBody();
		expect(body).toContain("Disallow: /api/\n");
		expect(body).not.toMatch(/Disallow: \/[^/\n]+\/api\//);
	});

	it("blocks Reflectionbot from the whole site", async () => {
		const body = await robotsBody();
		expect(body).toContain("User-agent: Reflectionbot\nDisallow: /\n");
	});
});
