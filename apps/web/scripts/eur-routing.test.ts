import fs from "node:fs";
import path from "node:path";

jest.mock("./importer/paths", () => ({ DATA_ROOT: "", DIR_ALIASES: "" }));
import { phaseoRoutingEnabled } from "./importer/v2";

const catalogRoot = path.resolve(__dirname, "../../../packages/data/catalog/src/data");
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

function pricingFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? pricingFiles(file) : entry.name === "pricing.json" ? [file] : [];
    });
}

it("keeps every EUR-priced catalog route disabled, including mixed-currency offers", () => {
    const violations: string[] = [];
    let eurCards = 0;
    for (const file of pricingFiles(path.join(catalogRoot, "pricing"))) {
        const card = readJson(file);
        // Include future EUR rates too: importing a scheduled price must not
        // silently turn a USD route into an executable foreign-currency route.
        if (!card.rules?.some((rule: any) => rule.currency === "EUR")) continue;
        eurCards++;
        const providerDir = path.join(catalogRoot, "api_providers", card.api_provider_id);
        const provider = readJson(path.join(providerDir, "api_provider.json"));
        const routes = readJson(path.join(providerDir, "models.json")).filter((route: any) =>
            [route.api_model_id, route.provider_model_slug, route.internal_model_id].includes(card.api_model_id));
        expect(routes.length).toBeGreaterThan(0);
        for (const route of routes) {
            if (provider.routing_enabled !== false &&
                phaseoRoutingEnabled(route, provider.routable === false)) {
                violations.push(`${route.provider_api_model_id}: ${card.capability_id}`);
            }
        }
    }
    expect(eurCards).toBeGreaterThan(0);
    expect(violations).toEqual([]);
});
