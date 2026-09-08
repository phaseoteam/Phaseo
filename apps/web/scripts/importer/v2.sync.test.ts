import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

let mockDataRoot: string;
const mockRows = new Map<string, Record<string, any>[]>();
const mockUpserts = new Map<string, Record<string, any>[]>();
const mockUpdates: string[] = [];

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
            update: (values: Record<string, any>) => {
                const filters: ((row: Record<string, any>) => boolean)[] = [];
                const query = {
                    eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
                    in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return query; },
                    then: (resolve: (value: unknown) => unknown) => {
                        for (const row of mockRows.get(table) ?? []) {
                            if (filters.every(filter => filter(row))) Object.assign(row, values);
                        }
                        mockUpdates.push(table);
                        return resolve({ data: [] });
                    },
                };
                return query;
            },
            delete: () => {
                if (["v2_models", "v2_model_provider_routes", "v2_model_aliases", "v2_pricing_skus", "v2_benchmark_results", "v2_subscription_plans", "v2_subscription_plan_models"].includes(table)) {
                    throw new Error(`Saved catalogue records cannot be deleted: ${table}`);
                }
                return { eq: () => ({ data: [] }), in: () => ({ data: [] }) };
            },
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
        write("models/lab/active/model.json", { model_id: "lab/active", organisation_id: "lab", name: "Active", benchmarks: [{ benchmark_id: "bench", score: 1 }] });
        write("benchmarks/bench/benchmark.json", { benchmark_id: "bench", benchmark_name: "Benchmark" });
        write("subscription_plans/current/plan.json", { plan_id: "current", name: "Current", models: [{ model_id: "lab/active" }] });
        write("api_providers/provider/api_provider.json", { api_provider_id: "provider", name: "Provider" });
        const providerModels = ["active", "managed", "suppressed", "plural-managed", "missing"].map(model => ({
            provider_api_model_id: `provider:lab/${model}`,
            api_model_id: `lab/${model}`,
            provider_model_slug: model,
            capabilities: [{ capability_id: "text.generate", status: "active" }],
        }));
        write("api_providers/provider/models.json", providerModels);
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
            { provider_model_id: "provider:lab/removed", provider_slug: "provider", model_slug: "lab/removed", metadata: { source: "json" }, status: "active", routing_enabled: true },
        ]);
        mockRows.set("v2_pricing_skus", [{ sku_id: "old-sku", provider_model_id: "provider:lab/active", sku_code: "old", version: 1, status: "active", metadata: { source: "json" } }]);
        mockRows.set("v2_route_capabilities", [
            { provider_model_id: "provider:lab/removed", capability_id: "image.generate", status: "active" },
            { provider_model_id: "provider:lab/active", capability_id: "image.generate", status: "active" },
        ]);
        mockRows.set("v2_model_aliases", [
            { alias_slug: "openai/gpt-latest", enabled: true },
            { alias_slug: "lab/removed-alias", enabled: true, metadata: { source: "json" } },
            { alias_slug: "lab/admin-alias", enabled: true, metadata: { source: "admin" } },
        ]);
        mockRows.set("v2_benchmark_results", [{ result_id: "old-result", model_slug: "lab/active" }]);
        mockRows.set("v2_models", [{ model_slug: "lab/removed", metadata: { source: "json" } }]);
        mockRows.set("v2_subscription_plans", [{ plan_uuid: "old-plan" }]);
        mockRows.set("v2_subscription_plan_models", [{ plan_uuid: "old-plan", model_slug: "lab/active" }]);

        await syncV2Catalogue();

        expect(mockUpserts.get("v2_model_provider_routes")?.map(row => row.provider_model_id))
            .toEqual(["provider:lab/active"]);
        expect(mockUpserts.get("v2_route_capabilities"))
            .toEqual([expect.objectContaining({ provider_model_id: "provider:lab/active", capability_id: "text.generate", status: "active" })]);
        expect(mockUpserts.get("v2_pricing_skus")?.map(row => row.provider_model_id))
            .toEqual(["provider:lab/active"]);
        expect(mockUpserts.get("v2_route_variants"))
            .toEqual([expect.objectContaining({ provider_model_id: "provider:lab/active", variant_key: "global:standard" })]);
        expect(mockRows.get("v2_pricing_skus")?.find(row => row.sku_id === "old-sku"))
            .toMatchObject({ status: "deprecated", effective_to: expect.any(String) });
        expect(mockRows.get("v2_model_provider_routes")?.find(row => row.provider_model_id === "provider:lab/removed"))
            .toMatchObject({ status: "disabled", routing_enabled: false, effective_to: expect.any(String) });
        expect(mockRows.get("v2_model_aliases"))
            .toEqual([
                expect.objectContaining({ alias_slug: "openai/gpt-latest", enabled: false, effective_to: expect.any(String) }),
                expect.objectContaining({ alias_slug: "lab/removed-alias", enabled: false, effective_to: expect.any(String) }),
                { alias_slug: "lab/admin-alias", enabled: true, metadata: { source: "admin" } },
            ]);
        expect(mockRows.get("v2_models")?.find(row => row.model_slug === "lab/removed"))
            .toMatchObject({ hidden: true, status: "retired", retired_at: expect.any(String) });
        expect(mockRows.get("v2_benchmark_results")?.find(row => row.result_id === "old-result"))
            .toMatchObject({ effective_to: expect.any(String) });
        expect(mockRows.get("v2_subscription_plan_models")?.find(row => row.plan_uuid === "old-plan"))
            .toMatchObject({ model_slug: "lab/active", effective_to: expect.any(String) });
        expect(mockRows.get("v2_subscription_plans")).toContainEqual({ plan_uuid: "old-plan", effective_to: expect.any(String) });
        expect(mockRows.get("v2_route_capabilities")?.filter(row => row.capability_id === "image.generate"))
            .toEqual([
                expect.objectContaining({ provider_model_id: "provider:lab/removed", status: "disabled", effective_to: expect.any(String) }),
                expect.objectContaining({ provider_model_id: "provider:lab/active", status: "disabled", effective_to: expect.any(String) }),
            ]);
        const restoredBenchmark = mockRows.get("v2_benchmark_results")!.find(row => row.result_id !== "old-result")!;
        const restoredMembership = mockRows.get("v2_subscription_plan_models")!.find(row => row.plan_uuid !== "old-plan")!;
        restoredBenchmark.effective_to = "2026-01-01T00:00:00Z";
        restoredMembership.effective_to = "2026-01-01T00:00:00Z";
        const updateCount = mockUpdates.length;
        await syncV2Catalogue();
        expect(mockUpdates).toHaveLength(updateCount);
        expect(mockRows.get("v2_benchmark_results")?.find(row => row.result_id === restoredBenchmark.result_id)?.effective_to).toBeNull();
        expect(mockRows.get("v2_subscription_plan_models")?.find(row => row.plan_uuid === restoredMembership.plan_uuid)?.effective_to).toBeNull();
        write("models/lab/removed/model.json", { model_id: "lab/removed", organisation_id: "lab", name: "Restored" });
        write("api_providers/provider/models.json", [...providerModels, {
            provider_api_model_id: "provider:lab/removed", api_model_id: "lab/removed", provider_model_slug: "removed",
            is_active_gateway: true, capabilities: [{ capability_id: "text.generate", status: "active" }],
        }]);
        await syncV2Catalogue();
        expect(mockRows.get("v2_route_capabilities")?.filter(row => row.provider_model_id === "provider:lab/removed"))
            .toEqual([
                expect.objectContaining({ capability_id: "image.generate", status: "disabled", effective_to: expect.any(String) }),
                expect.objectContaining({ capability_id: "text.generate", status: "active", effective_to: null }),
            ]);
    } finally {
        rmSync(mockDataRoot, { recursive: true, force: true });
    }
});
