import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

let mockDataRoot: string;
const mockRows = new Map<string, Record<string, any>[]>();
const mockUpserts = new Map<string, Record<string, any>[]>();

jest.mock("./paths", () => ({
    get DATA_ROOT() { return mockDataRoot; },
    get DIR_ALIASES() { return join(mockDataRoot, "aliases"); },
}));
jest.mock("./supa", () => ({
    isDryRun: () => false,
    logWrite: jest.fn(),
    assertOk: (result: { data: unknown; error?: Error }) => {
        if (result.error) throw result.error;
        return result.data;
    },
    client: () => ({
        from: (table: string) => ({
            select: () => ({ range: () => ({ data: mockRows.get(table) ?? [] }) }),
            upsert: (rows: Record<string, any>[], { onConflict }: { onConflict: string }) => {
                if (table === "v2_route_capabilities" || table === "v2_pricing_skus") {
                    const parents = mockUpserts.get("v2_model_provider_routes") ?? [];
                    for (const row of rows) {
                        if (!parents.some(parent => parent.provider_model_id === row.provider_model_id)) {
                            throw new Error(`Missing route: ${row.provider_model_id}`);
                        }
                    }
                }
                mockUpserts.set(table, [...(mockUpserts.get(table) ?? []), ...rows]);
                const conflictColumns = onConflict.split(",");
                const identity = (row: Record<string, any>) => JSON.stringify(conflictColumns.map(column => row[column]));
                const persisted = new Map((mockRows.get(table) ?? []).map(row => [identity(row), row]));
                for (const row of rows) persisted.set(identity(row), { ...persisted.get(identity(row)), ...row });
                mockRows.set(table, [...persisted.values()]);
                return { data: [] };
            },
            delete: () => ({ eq: () => ({ data: [] }), in: () => ({ data: [] }) }),
        }),
        rpc: () => ({ data: [] }),
    }),
}));

import { syncV2Catalogue } from "./v2";

it("keeps protected and unresolved route children out of repository writes", async () => {
    mockDataRoot = mkdtempSync(join(tmpdir(), "phaseo-importer-test-"));
    const write = (path: string, data: unknown) => {
        const file = join(mockDataRoot, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(data));
    };
    try {
        mkdirSync(join(mockDataRoot, "aliases"));
        write("organisations/lab/organisation.json", { organisation_id: "lab", name: "Lab" });
        for (const model of ["active", "managed", "suppressed", "plural-managed"]) {
            write(`models/lab/${model}/model.json`, { model_id: `lab/${model}`, organisation_id: "lab", name: model });
        }
        write("api_providers/provider/api_provider.json", { api_provider_id: "provider", name: "Provider" });
        write("api_providers/provider/models.json", ["active", "managed", "suppressed", "plural-managed", "missing"].map(model => ({
            provider_api_model_id: `provider:lab/${model}`,
            api_model_id: `lab/${model}`,
            provider_model_slug: model,
            capabilities: [{ capability_id: "text.generate", status: "active" }],
        })));
        for (const model of ["active", "managed", "suppressed", "plural-managed", "missing"]) {
            write(`pricing/provider/${model}/pricing.json`, {
                key: `provider:lab/${model}:text.generate`,
                capability_id: "text.generate",
                rules: [{ meter: "input_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 1 }],
            });
        }
        mockRows.set("v2_catalogue_source_overrides", [
            { source_type: "model", source_key: "lab/managed", disposition: "database_managed" },
            { source_type: "models", source_key: "lab/plural-managed", disposition: "database_managed" },
            { source_type: "provider_route", source_key: "provider:lab/suppressed", disposition: "suppressed" },
        ]);
        mockRows.set("v2_model_provider_routes", [
            { provider_model_id: "provider:lab/plural-managed", provider_slug: "provider", model_slug: "lab/plural-managed" },
            { provider_model_id: "provider:lab/suppressed", provider_slug: "provider", model_slug: "lab/suppressed" },
        ]);

        await syncV2Catalogue();

        expect(mockUpserts.get("v2_model_provider_routes")?.map(row => row.provider_model_id))
            .toEqual(["provider:lab/active"]);
        expect(mockUpserts.get("v2_route_capabilities"))
            .toEqual([expect.objectContaining({ provider_model_id: "provider:lab/active", capability_id: "text.generate", status: "active" })]);
        expect(mockUpserts.get("v2_pricing_skus")?.map(row => row.provider_model_id))
            .toEqual(["provider:lab/active"]);
        expect(mockUpserts.get("v2_route_variants"))
            .toEqual([expect.objectContaining({ provider_model_id: "provider:lab/active", variant_key: "global:standard" })]);
    } finally {
        rmSync(mockDataRoot, { recursive: true, force: true });
    }
});
