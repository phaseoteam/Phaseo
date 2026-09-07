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

	test("resolves Nex AGI themed variants", () => {
		expect(
			resolveLogo("nex-agi", { variant: "light", theme: "light" })
		).toMatchObject({
			id: "nex-agi",
			label: "Nex AGI",
			src: "/logos/nex-agi_light.svg",
			variant: "light",
		});

		expect(
			resolveLogo("Nex AGI", { variant: "dark", theme: "dark" })
		).toMatchObject({
			id: "nex-agi",
			label: "Nex AGI",
			src: "/logos/nex-agi_dark.svg",
			variant: "dark",
		});
	});

	test("resolves the Mind Lab logo by catalogue id", () => {
		expect(resolveLogo("mindai")).toMatchObject({
			id: "mindai",
			label: "Mind Lab",
			src: "/logos/mindai.svg",
			variant: "color",
		});
	});

	test("resolves the Sakana AI logo by catalogue id", () => {
		expect(resolveLogo("sakana")).toMatchObject({
			id: "sakana",
			label: "Sakana AI",
			src: "/logos/sakana.svg",
			variant: "color",
		});
	});

	test("resolves the Modal logo by catalogue id", () => {
		expect(resolveLogo("modal")).toMatchObject({
			id: "modal",
			label: "Modal",
			src: "/logos/modal.svg",
			variant: "color",
		});
	});

	test("resolves the CrofAI logo by provider id", () => {
		expect(resolveLogo("crofai")).toMatchObject({
			id: "crofai",
			label: "CrofAI",
			src: "/logos/crofai.svg",
			variant: "color",
		});
	});

	test("resolves themed Poe logo variants", () => {
		expect(resolveLogo("poe", { theme: "light" })).toMatchObject({
			id: "poe",
			label: "Poe",
			src: "/logos/poe_light.svg",
			variant: "light",
		});

		expect(resolveLogo("poe", { theme: "dark" })).toMatchObject({
			id: "poe",
			label: "Poe",
			src: "/logos/poe_dark.svg",
			variant: "dark",
		});
	});

		test.each([
		["cline", "/logos/cline_light.svg", "/logos/cline_dark.svg"],
		["helicone", "/logos/helicone_light.svg", "/logos/helicone_dark.svg"],
		["ollama", "/logos/ollama_light.svg", "/logos/ollama_dark.svg"],
		["runinfra", "/logos/runinfra.svg", "/logos/runinfra_dark.svg"],
		["sarvam", "/logos/sarvam_light.svg", "/logos/sarvam_dark.svg"],
		["tinfoil", "/logos/tinfoil_light.svg", "/logos/tinfoil_dark.svg"],
		["v0", "/logos/v0_light.svg", "/logos/v0_dark.svg"],
		["ltx", "/logos/ltx_light.svg", "/logos/ltx_dark.svg"],
		["lightricks", "/logos/ltx_light.svg", "/logos/ltx_dark.svg"],
	])("resolves themed %s logo variants", (id, lightSrc, darkSrc) => {
		expect(resolveLogo(id, { theme: "light" })).toMatchObject({
			src: lightSrc,
			variant: "light",
		});
		expect(resolveLogo(id, { theme: "dark" })).toMatchObject({
			src: darkSrc,
			variant: "dark",
		});
	});

	test.each([
		["alibaba-cn", "Alibaba Cloud", "/logos/alibaba-cloud.svg"],
		["cloudflare-ai-gateway", "Cloudflare AI Gateway", "/logos/cloudflare.svg"],
		["github-models", "Github Models", "/logos/github_light.svg"],
		["huggingface", "Hugging Face", "/logos/huggingface.svg"],
		["kilo", "Kilo Code", "/logos/kilo_light.svg"],
		["lmstudio", "LM Studio", "/logos/lmstudio_light.svg"],
		["modelscope", "ModelScope", "/logos/modelscope.svg"],
		["nebius", "Nebius", "/logos/nebius-token-factory_light.svg"],
		["perplexity-agent", "Perplexity Agent", "/logos/perplexity.svg"],
		["poe", "Poe", "/logos/poe_light.svg"],
		["qiniu-ai", "Qiniu AI", "/logos/qiniu.svg"],
		["siliconflow-cn", "Siliconflow Cn", "/logos/siliconflow.svg"],
		["submodel", "SubModel", "/logos/submodel.svg"],
		["togetherai", "Together AI", "/logos/together.svg"],
		["wandb", "Weights & Biases", "/logos/weights-and-biases.svg"],
		["zenmux", "ZenMux", "/logos/zenmux_light.svg"],
	])("resolves the %s logo mapping", (id, label, src) => {
		expect(resolveLogo(id, { variant: ["github-models", "kilo", "lmstudio", "nebius", "zenmux"].includes(id) ? "light" : "auto" })).toMatchObject({
			label,
			src,
		});
	});

	test("resolves additional provider logo coverage", () => {
		for (const [id, src] of [
			["aihubmix", "/logos/aihubmix.svg"],
			["io-net", "/logos/ionet.svg"],
			["ovhcloud", "/logos/ovhcloud.svg"],
			["sap-ai-core", "/logos/sap.svg"],
			["tinyfish", "/logos/tinyfish.svg"],
			["zhipuai-coding-plan", "/logos/zhipu.svg"],
		] as const) {
			expect(resolveLogo(id)).toMatchObject({ src });
		}
	});

	test("uses the IO.net brand capitalization", () => {
		expect(getLogoLabel("io-net")).toBe("IO.net");
		expect(resolveLogo("io-net")).toMatchObject({ label: "IO.net" });
	});

	test("resolves the Moonshot display name to the MoonshotAI asset", () => {
		expect(resolveLogo("Moonshot", { theme: "dark" })).toMatchObject({
			id: "moonshotai",
			src: "/logos/moonshotai_dark.svg",
		});
	});
});
