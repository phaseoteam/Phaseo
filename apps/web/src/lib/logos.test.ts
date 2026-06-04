import { getLogoLabel, resolveLogo } from "@/lib/logos";

describe("logos", () => {
	test("resolves the DigitalOcean logo asset by provider id", () => {
		expect(resolveLogo("digitalocean")).toMatchObject({
			id: "digitalocean",
			label: "DigitalOcean",
			src: "/logos/digitalocean.svg",
			variant: "color",
		});
	});

	test("normalizes DigitalOcean lookup aliases to the shared logo id", () => {
		expect(resolveLogo("digital-ocean")).toMatchObject({
			id: "digitalocean",
			label: "DigitalOcean",
			src: "/logos/digitalocean.svg",
		});
		expect(getLogoLabel("Digital Ocean")).toBe("DigitalOcean");
	});
});
