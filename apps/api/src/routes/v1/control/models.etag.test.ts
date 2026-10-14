import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();
const fetchGatewayContextMock = vi.fn();
const bindings = vi.hoisted(() => ({ region: null as string | null }));

vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => (bindings.region ? { GATEWAY_ROUTING_REGION: bindings.region } : null),
    getSupabaseAdmin: () => ({
        from: () => {
            const query: any = {
                select: () => query,
                eq: () => query,
                order: async () => ({ data: [], error: null }),
            };
            return query;
        },
    }),
}));

vi.mock("@pipeline/before/guards", () => ({
    guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("./models.catalogue", () => ({
    fetchCatalogue: (...args: any[]) => fetchCatalogueMock(...args),
    scopePricingSummary: (pricing: unknown) => pricing,
}));

vi.mock("@pipeline/before/context", () => ({
    fetchGatewayContext: (...args: any[]) => fetchGatewayContextMock(...args),
}));

import { computeModelListEtag, handleModels, ifNoneMatchMatches } from "./models";

function buildCatalogueModel(overrides: Record<string, unknown> = {}) {
    return {
        model_id: "openai/gpt-4o-mini",
        base_model_id: "openai/gpt-4o-mini",
        variant_kind: "standard",
        previous_model_id: null,
        replacement_model_id: null,
        name: "GPT-4o Mini",
        description: "A compact model for fast text generation.",
        release_date: "2026-01-01",
        deprecation_date: null,
        retirement_date: null,
        status: "active",
        organisation_id: "openai",
        organisation_name: "OpenAI",
        organisation_colour: null,
        aliases: [],
        endpoints: ["responses"],
        input_types: ["text"],
        output_types: ["text"],
        providers: [{
            api_provider_id: "openai",
            api_provider_name: "OpenAI",
            execution_regions: ["eu", "us"],
            data_regions: ["eu", "us"],
            is_active_gateway: true,
            availability_status: "active",
            availability_reason: "active",
            provider_status: "active",
            provider_routing_status: "active",
            model_routing_status: "active",
            capability_status: "active",
            effective_from: null,
            effective_to: null,
            endpoints: ["responses"],
            input_modalities: [],
            output_modalities: [],
            params: ["temperature"],
            params_detail: {},
            service_tiers: ["flex", "priority", "standard"],
        }],
        provider_endpoint_capabilities: {},
        supported_params: ["temperature"],
        supported_params_detail: {},
        top_provider: "openai",
        pricing: { pricing_plan: "standard", meters: {} },
        provider_pricing: {},
        provider_endpoint_pricing: {},
        details: {},
        availability: {
            status: "active",
            provider_count: 1,
            active_provider_count: 1,
            coming_soon_provider_count: 0,
            inactive_provider_count: 0,
        },
        ...overrides,
    };
}

function request(query = "", headers: Record<string, string> = {}) {
    return new Request(`https://api.example.com/v1/models${query}`, { headers });
}

describe("GET /v1/models ETag", () => {
    beforeEach(() => {
        bindings.region = null;
        guardAuthMock.mockReset();
        fetchCatalogueMock.mockReset();
        fetchGatewayContextMock.mockReset();
        guardAuthMock.mockResolvedValue({ ok: true, value: { workspaceId: "ws_test", apiKeyId: "key_test" } });
        fetchCatalogueMock.mockResolvedValue([buildCatalogueModel()]);
        fetchGatewayContextMock.mockResolvedValue({ resolvedModel: "phaseo/free", providers: [], pricing: {} });
    });

    it.each(["", "?format=openai"])("returns a strong ETag on 200 (%s)", async (query) => {
        const response = await handleModels(request(query));
        expect(response.status).toBe(200);
        const etag = response.headers.get("etag");
        expect(etag).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
        expect(response.headers.get("cache-control")).toBe("private, max-age=300, stale-while-revalidate=300");
        expect(response.headers.get("vary")).toBe("Authorization");
    });

    it.each(["", "?format=openai"])("returns 304 with no body when If-None-Match matches (%s)", async (query) => {
        const first = await handleModels(request(query));
        const etag = first.headers.get("etag")!;
        const second = await handleModels(request(query, { "If-None-Match": etag }));
        expect(second.status).toBe(304);
        expect(second.body).toBeNull();
        expect(await second.text()).toBe("");
        expect(second.headers.get("etag")).toBe(etag);
        expect(second.headers.get("cache-control")).toBe("private, max-age=300, stale-while-revalidate=300");
        expect(second.headers.get("vary")).toBe("Authorization");
    });

    it("returns 200 with a new ETag when the catalogue changes", async () => {
        const first = await handleModels(request());
        const etag = first.headers.get("etag")!;
        const changed = buildCatalogueModel();
        changed.providers[0].service_tiers = ["standard"];
        fetchCatalogueMock.mockResolvedValue([changed]);
        const second = await handleModels(request("", { "If-None-Match": etag }));
        expect(second.status).toBe(200);
        expect(second.headers.get("etag")).not.toBe(etag);
        expect((await second.json() as any).models[0].offers[0].service_tiers).toEqual(["standard"]);
    });

    it("changes the ETag with pagination and format", async () => {
        const json = (await handleModels(request())).headers.get("etag");
        const paged = (await handleModels(request("?offset=1"))).headers.get("etag");
        const openai = (await handleModels(request("?format=openai"))).headers.get("etag");
        expect(new Set([json, paged, openai]).size).toBe(3);
    });

    it("keeps the ETag stable when only gateway_region differs", async () => {
        bindings.region = "eu";
        const eu = await handleModels(request());
        bindings.region = "us";
        const us = await handleModels(request());
        expect((await eu.json() as any).gateway_region).toBe("eu");
        expect((await us.json() as any).gateway_region).toBe("us");
        expect(eu.headers.get("etag")).toBe(us.headers.get("etag"));
    });

    it("matches weak and list forms of If-None-Match", async () => {
        const etag = (await handleModels(request())).headers.get("etag")!;
        for (const header of [`W/${etag}`, `"stale", ${etag}`, `"stale",W/${etag} , "other"`, "*"]) {
            const response = await handleModels(request("", { "If-None-Match": header }));
            expect(response.status, header).toBe(304);
        }
        const miss = await handleModels(request("", { "If-None-Match": `"stale", W/"other"` }));
        expect(miss.status).toBe(200);
        expect(miss.headers.get("etag")).toBe(etag);
    });

    it("does not add an ETag to errors", async () => {
        const invalid = await handleModels(request("?format=xml"));
        expect(invalid.status).toBe(400);
        expect(invalid.headers.get("etag")).toBeNull();

        fetchCatalogueMock.mockRejectedValue(new Error("boom"));
        const failed = await handleModels(request("", { "If-None-Match": "*" }));
        expect(failed.status).toBe(500);
        expect(failed.headers.get("etag")).toBeNull();
    });
});

describe("model list ETag helpers", () => {
    it("hashes content independently of object key order", async () => {
        expect(await computeModelListEtag({ a: 1, b: { c: [1, 2], d: null } }))
            .toBe(await computeModelListEtag({ b: { d: null, c: [1, 2] }, a: 1 }));
        expect(await computeModelListEtag({ a: [1, 2] })).not.toBe(await computeModelListEtag({ a: [2, 1] }));
    });

    it("compares If-None-Match weakly", () => {
        expect(ifNoneMatchMatches(null, "\"abc\"")).toBe(false);
        expect(ifNoneMatchMatches("", "\"abc\"")).toBe(false);
        expect(ifNoneMatchMatches("\"abc\"", "\"abc\"")).toBe(true);
        expect(ifNoneMatchMatches("W/\"abc\"", "\"abc\"")).toBe(true);
        expect(ifNoneMatchMatches("\"x\", W/\"abc\"", "\"abc\"")).toBe(true);
        expect(ifNoneMatchMatches(" * ", "\"abc\"")).toBe(true);
        expect(ifNoneMatchMatches("\"abcd\"", "\"abc\"")).toBe(false);
    });
});
