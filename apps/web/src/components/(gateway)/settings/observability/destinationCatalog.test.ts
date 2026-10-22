import { AVAILABLE_DESTINATIONS, COMING_SOON_DESTINATIONS } from "./destinationCatalog";
import { OTLP_PRESETS } from "./broadcastDestinations";
import { resolveLogo } from "@/lib/logos";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("observability destination logos", () => {
	test("Weave retains its product branding separately from Forge inference", () => {
		const destination = AVAILABLE_DESTINATIONS.find((item) => item.label === "W&B Weave");
		expect(destination).toMatchObject({ label: "W&B Weave", logoId: "wandb-weave" });
		for (const theme of ["light", "dark"] as const) {
			expect(resolveLogo(destination!.logoId!, { theme })).toMatchObject({
				label: "W&B Weave",
				src: "/logos/weights-and-biases.svg",
			});
			expect(resolveLogo("weights-and-biases", { theme }).label).toBe("CoreWeave Forge");
		}
	});

	test("every assigned logo resolves to a local SVG asset", () => {
		for (const destination of [...AVAILABLE_DESTINATIONS, ...COMING_SOON_DESTINATIONS]) {
			if (!destination.logoId) continue;

			const logo = resolveLogo(destination.logoId);
			expect(logo.src).toMatch(/^\/.*\.svg$/);
			for (const src of Object.values(logo.assets)) {
				expect(src).toMatch(/^\/.*\.svg$/);
				expect(existsSync(join(process.cwd(), "public", src.slice(1)))).toBe(true);
			}
		}
	});
});

describe("OTLP preset forms", () => {
	test("ask for every field their preset reads, required unless it has a default", () => {
		for (const [id, preset] of Object.entries(OTLP_PRESETS)) {
			const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === id);
			expect(definition).toBeDefined();
			const templates = [preset!.endpoint, ...Object.values(preset!.headers ?? {}), ...Object.values(preset!.resourceAttributes ?? {})];
			for (const [, placeholder] of templates.join(" ").matchAll(/\{([a-z0-9_:]+\??)\}/g)) {
				const names = placeholder.startsWith("basic:") ? placeholder.split(":").slice(1) : [placeholder];
				for (const raw of names) {
					const name = raw.replace(/\?$/, "");
					const field = definition!.fields.find((candidate) => candidate.key === name);
					expect({ id, name, found: Boolean(field) }).toEqual({ id, name, found: true });
					const required = !raw.endsWith("?") && !preset!.defaults?.[name];
					expect({ id, name, required: field!.required !== false }).toEqual({ id, name, required });
				}
			}
		}
	});
});
