import { getProviderLogos } from "./providerLogos";

describe("getProviderLogos", () => {
	it("only returns known logos that belong to API providers", () => {
		const logos = getProviderLogos([
			"anthropic",
			"openai",
			"vercel",
		]);

		expect(logos).toEqual(expect.arrayContaining(["anthropic", "openai", "vercel"]));
		expect(logos).not.toContain("cursor");
		expect(logos).not.toContain("github");
	});

	it("retains explicit provider exclusions", () => {
		expect(getProviderLogos(["openrouter", "phaseo"])).toEqual([]);
	});

	it("includes provider IDs resolved through shared logo aliases", () => {
		expect(
			getProviderLogos(["io-net", "aion-labs", "elevenlabs", "z-ai"])
		).toEqual(expect.arrayContaining(["ionet", "aionlabs", "eleven-labs", "zai"]));
	});
});
