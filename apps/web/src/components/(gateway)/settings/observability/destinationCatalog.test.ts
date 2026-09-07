import { COMING_SOON_DESTINATIONS } from "./destinationCatalog";
import { resolveLogo } from "@/lib/logos";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("coming-soon observability destinations", () => {
	test("every assigned logo resolves to a local SVG asset", () => {
		for (const destination of COMING_SOON_DESTINATIONS) {
			if (!destination.logoId) continue;

			const logo = resolveLogo(destination.logoId);
			expect(logo.src).toMatch(/^\/.*\.svg$/);
			expect(existsSync(join(process.cwd(), "public", logo.src!.slice(1)))).toBe(true);
		}
	});
});
