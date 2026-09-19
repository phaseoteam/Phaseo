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
					components?: Array<{ type: number; style?: number; url?: string }>;
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
		expect(sections).toHaveLength(2);
		expect(sections[0]?.accessory?.type).toBe(11);
		expect(sections[0]?.accessory?.media?.url).toBe(
			"https://cdn.example.com/z-ai.png",
		);
		expect(sections[1]?.components?.[0]).toEqual(
			expect.objectContaining({
				type: 10,
				content: expect.stringContaining("Powered by [Phaseo]"),
			}),
		);
		expect(sections[1]).toEqual(
			expect.objectContaining({
				accessory: expect.objectContaining({
					media: expect.objectContaining({
						url: expect.stringContaining("png_logo_light.png"),
					}),
				}),
			}),
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

	it("falls back to the Phaseo accent when a lab colour is unavailable", () => {
		expect(discordAccentColor(null)).toBe(0x2563eb);
		expect(
			buildDiscordModelComponentEmbed({
				...options,
				organisationColour: "not-a-colour",
			}).component.accent_color,
		).toBe(0x2563eb);
	});

	it("uses the known lab logo when an external logo is unavailable", () => {
		const payload = buildDiscordModelComponentEmbed({
			...options,
			organisationLogoUrl: null,
		});
		const sections = payload.component.components.filter(
			(component) => component.type === 9,
		);

		expect(sections).toHaveLength(2);
		expect(sections[0]).toEqual(
			expect.objectContaining({
				accessory: expect.objectContaining({
					media: expect.objectContaining({
						url: expect.stringContaining("/logos/zai_light.svg"),
					}),
				}),
			}),
		);
		expect(sections[1]).toEqual(
			expect.objectContaining({
				accessory: expect.objectContaining({
					media: expect.objectContaining({
						url: expect.stringContaining("png_logo_light.png"),
					}),
				}),
			}),
		);
	});

	it("uses the Phaseo logo once when no lab logo is available", () => {
		const payload = buildDiscordModelComponentEmbed({
			...options,
			organisationId: null,
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
						url: expect.stringContaining("png_logo_light.png"),
					}),
				}),
			}),
		);
	});
});
