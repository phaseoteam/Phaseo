import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolveLogo } from "@/lib/logos";
import {
	buildDiscordModelComponentEmbed,
	discordAccentColor,
	serializeDiscordComponentEmbed,
} from "./DiscordComponentEmbed";

describe("Discord component embed", () => {
	const options = {
		modelId: "z-ai/glm-5.3-flashx",
		modelName: "GLM 5.3 FlashX",
		organisationName: "Z.ai",
		modelPath: "/models/z-ai/glm-5.3-flashx",
		organisationId: "z-ai",
		description:
			"A fast native multimodal model with a long context window.</script>",
		contextLength: 1_000_000,
		organisationColour: "#12abef",
		organisationLogoUrl: "https://cdn.example.com/z-ai.png",
	};

	it("serializes a model preview with branded actions", () => {
		const payload = JSON.parse(serializeDiscordComponentEmbed(options)) as {
			component: {
				type: number;
				accent_color: number;
				components: Array<{
					type: number;
					content?: string;
					components?: Array<{
						type: number;
						style?: number;
						url?: string;
						content?: string;
					}>;
					accessory?: { type: number; media?: { url?: string } };
				}>;
			};
		};

		expect(payload.component.type).toBe(17);
		expect(payload.component.accent_color).toBe(0x12abef);
		expect(payload.component.components).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 9 }),
				expect.objectContaining({ type: 14 }),
				expect.objectContaining({ type: 1 }),
			]),
		);

		const sections = payload.component.components.filter(
			(component) => component.type === 9,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.components?.[0]?.content).toContain(
			"# [GLM 5.3 FlashX](",
		);
		expect(sections[0]?.accessory?.type).toBe(11);
		expect(sections[0]?.accessory?.media?.url).toContain(
			"/logos/discord/zai.png",
		);
		const poweredByLine = payload.component.components.find(
			(component) =>
				component.type === 10 &&
				component.content?.includes("Powered by [Phaseo]"),
		);
		expect(poweredByLine).toEqual(
			expect.objectContaining({
				type: 10,
				content: expect.stringContaining("Powered by [Phaseo]"),
			}),
		);
		expect(serializeDiscordComponentEmbed(options)).not.toContain(
			"png_logo_discord.png",
		);

		const actionRow = payload.component.components.find(
			(component) => component.type === 1,
		);
		expect(actionRow?.components).toHaveLength(4);
		expect(actionRow?.components).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 2, style: 5, label: "Open" }),
				expect.objectContaining({ type: 2, style: 5, label: "Chat" }),
				expect.objectContaining({ type: 2, style: 5, label: "Compare" }),
				expect.objectContaining({ type: 2, style: 5, label: "API" }),
			]),
		);
		expect(
			actionRow?.components?.every((button) => button.url?.startsWith("http")),
		).toBe(true);
		expect(serializeDiscordComponentEmbed(options)).not.toContain("</script>");
		expect(serializeDiscordComponentEmbed(options)).toContain("GLM 5.3 FlashX");
	});

	it("keeps plain text while escaping angle brackets in the JSON script payload", () => {
		const serialized = serializeDiscordComponentEmbed({
			...options,
			description:
				"Valid comparison: 1 < 2 > 0. Literal &lt;script&gt;. </script><script>alert(1)</script>",
		});
		const payload = JSON.parse(serialized);
		const text = payload.component.components[0]?.components?.[0]?.content;

		expect(serialized).not.toContain("<");
		expect(serialized).toContain("\\u003c");
		expect(text).toContain("1 < 2 > 0");
		expect(text).toContain("<script>");
	});

	it("keeps Markdown in model names from creating an unintended link", () => {
		const unsafeModelNames = [
			"safe](https://attacker.example) [x",
			"safe&#93;(https://attacker.example) [x",
			"safe\\](https://attacker.example) [x",
		];

		for (const modelName of unsafeModelNames) {
			const payload = JSON.parse(
				serializeDiscordComponentEmbed({ ...options, modelName }),
			) as {
				component: {
					components: Array<{
						type: number;
						components?: Array<{ type: number; content?: string }>;
					}>;
				};
			};
			const modelTitle = payload.component.components
				.find((component) => component.type === 9)
				?.components?.find((component) => component.type === 10)?.content;

			expect(modelTitle).toContain("\\](");
			expect(modelTitle).toContain("\\[x](");
			expect(modelTitle).not.toContain("[safe](https://attacker.example)");
			expect(modelTitle).toContain("/models/z-ai/glm-5.3-flashx)");
		}
	});

	it("falls back to the Phaseo accent when a lab colour is unavailable", () => {
		expect(discordAccentColor(null)).toBe(0x2563eb);
		expect(
			buildDiscordModelComponentEmbed({
				...options,
				organisationColour: "not-a-colour",
			}).component.accent_color,
		).toBe(0x2563eb);
	});

	it("uses the Discord-safe known lab logo when an external logo is unavailable", () => {
		const payload = buildDiscordModelComponentEmbed({
			...options,
			organisationLogoUrl: null,
		});
		const sections = payload.component.components.filter(
			(component) => component.type === 9,
		);

		expect(sections).toHaveLength(1);
		expect(sections[0]).toEqual(
			expect.objectContaining({
				accessory: expect.objectContaining({
					media: expect.objectContaining({
						url: expect.stringContaining("/logos/discord/zai.png"),
					}),
				}),
			}),
		);
		expect(payload.component.components).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 10,
					content: expect.stringContaining("Powered by [Phaseo]"),
				}),
			]),
		);
	});

	it("does not show a Phaseo logo when no lab logo is available", () => {
		const payload = buildDiscordModelComponentEmbed({
			...options,
			organisationId: null,
			organisationLogoUrl: null,
		});
		const sections = payload.component.components.filter(
			(component) => component.type === 9,
		);

		expect(sections).toHaveLength(0);
		expect(JSON.stringify(payload)).not.toContain("png_logo_light.png");
	});

	it("keeps an uploaded PNG when there is no bundled lab logo", () => {
		const payload = buildDiscordModelComponentEmbed({
			...options,
			organisationId: null,
			organisationLogoUrl: "https://cdn.example.com/custom-lab.png",
		});
		const labSection = payload.component.components.find(
			(component) => component.type === 9,
		);

		expect(labSection).toEqual(
			expect.objectContaining({
				accessory: expect.objectContaining({
					media: expect.objectContaining({
						url: "https://cdn.example.com/custom-lab.png",
					}),
				}),
			}),
		);
	});

	it("ships PNGs for every catalog lab with a known logo", () => {
		const modelCatalogPath = path.resolve(
			__dirname,
			"../../../../../packages/data/catalog/src/data/models",
		);
		const discordLogoPath = path.resolve(
			__dirname,
			"../../../public/logos/discord",
		);
		const organisationIds = readdirSync(modelCatalogPath, {
			withFileTypes: true,
		})
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		const knownLogos = organisationIds
			.map((organisationId) => resolveLogo(organisationId, { variant: "dark" }))
			.filter((logo) => logo.id && logo.src);
		const missingPngs = knownLogos
			.map((logo) => `${logo.id}.png`)
			.filter((fileName) => !existsSync(path.join(discordLogoPath, fileName)));

		expect(knownLogos.length).toBeGreaterThan(0);
		expect(missingPngs).toEqual([]);
	});

	it("adds the Vercel bypass to preview-hosted lab logos", () => {
		const previousEnvironment = {
			VERCEL_ENV: process.env.VERCEL_ENV,
			VERCEL_URL: process.env.VERCEL_URL,
			VERCEL_AUTOMATION_BYPASS_SECRET:
				process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
		};
		process.env.VERCEL_ENV = "preview";
		process.env.VERCEL_URL = "phaseo-preview.vercel.app";
		process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "preview-test-secret";

		try {
			const payload = buildDiscordModelComponentEmbed({
				...options,
				organisationLogoUrl: null,
			});
			const sections = payload.component.components.filter(
				(component) => component.type === 9,
			);
			const labSection = sections[0];

			expect(labSection).toEqual(
				expect.objectContaining({
					accessory: expect.objectContaining({
						media: expect.objectContaining({
						url: "https://phaseo-preview.vercel.app/logos/discord/zai.png?x-vercel-protection-bypass=preview-test-secret",
						}),
					}),
				}),
			);
		} finally {
			for (const [name, value] of Object.entries(previousEnvironment)) {
				if (value === undefined) {
					delete process.env[name];
				} else {
					process.env[name] = value;
				}
			}
		}
	});
});
