import { COMING_SOON_DESTINATIONS } from "./destinationCatalog";
import { resolveLogo } from "@/lib/logos";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("coming-soon observability destinations", () => {
	test("Weave retains its product branding separately from Forge inference", () => {
		const destination = COMING_SOON_DESTINATIONS.find((item) => item.label === "W&B Weave");
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
		for (const destination of COMING_SOON_DESTINATIONS) {
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
