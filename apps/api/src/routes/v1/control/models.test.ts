import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
    guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("./models.catalogue", () => ({
    fetchCatalogue: (...args: any[]) => fetchCatalogueMock(...args),
}));

import { handleModels } from "./models";

function buildCatalogueModel(overrides: Record<string, unknown> = {}) {
    return {
        model_id: "openai/gpt-4o-mini",
        previous_model_id: null,
        name: "GPT-4o Mini",
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
        providers: [
            {
                api_provider_id: "openai",
                api_provider_name: "OpenAI",
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
                params: ["temperature"],
            },
        ],
        supported_params: ["temperature"],
        top_provider: "openai",
        pricing: {
            pricing_plan: "standard",
            meters: {},
        },
        availability: {
            status: "active",
            provider_count: 1,
            active_provider_count: 1,
            inactive_provider_count: 0,
        },
        ...overrides,
    };
}

describe("handleModels", () => {
    beforeEach(() => {
        guardAuthMock.mockReset();
        fetchCatalogueMock.mockReset();
        guardAuthMock.mockResolvedValue({
            ok: true,
            value: {
                workspaceId: "ws_test",
            },
        });
        fetchCatalogueMock.mockResolvedValue([buildCatalogueModel()]);
    });

    it("rejects invalid availability filters", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/?availability=future_only"),
            "shared",
        );

        expect(response.status).toBe(400);
        expect(fetchCatalogueMock).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            ok: false,
            error: "invalid_request",
        });
    });

    it("defaults availability mode to active", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ availability: "active" }),
        );
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            availability_mode: "active",
        });
    });

    it("forwards availability=all to the catalogue layer", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                availability: {
                    status: "coming_soon",
                    provider_count: 1,
                    active_provider_count: 0,
                    inactive_provider_count: 0,
                },
                providers: [
                    {
                        api_provider_id: "openai",
                        api_provider_name: "OpenAI",
                        is_active_gateway: false,
                        availability_status: "coming_soon",
                        availability_reason: "scheduled",
                        provider_status: "beta",
                        provider_routing_status: "active",
                        model_routing_status: "active",
                        capability_status: "internal_testing",
                        effective_from: "2026-06-01",
                        effective_to: null,
                        endpoints: ["responses"],
                        params: ["temperature"],
                    },
                ],
            }),
        ]);

        const response = await handleModels(
            new Request("https://api.example.com/?availability=all"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ availability: "all" }),
        );
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            availability_mode: "all",
            models: [
                {
                    model_id: "openai/gpt-4o-mini",
                    availability: {
                        status: "coming_soon",
                    },
                    providers: [
                        {
                            api_provider_id: "openai",
                            availability_status: "coming_soon",
                            availability_reason: "scheduled",
                            provider_status: "beta",
                            capability_status: "internal_testing",
                        },
                    ],
                },
            ],
        });
    });

    it("forwards provider filters to the catalogue layer", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/?provider=openai,anthropic"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ providerIds: ["openai", "anthropic"] }),
        );
    });

    it("forwards provider availability filters to the catalogue layer", async () => {
        const response = await handleModels(
            new Request(
                "https://api.example.com/?provider_availability_status=coming_soon,inactive&provider_availability_reason=preview_only,provider_not_ready",
            ),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerAvailabilityStatuses: ["coming_soon", "inactive"],
                providerAvailabilityReasons: ["preview_only", "provider_not_ready"],
            }),
        );
    });

    it("forwards provider and capability status filters to the catalogue layer", async () => {
        const response = await handleModels(
            new Request(
                "https://api.example.com/?provider_status=beta,alpha&capability_status=coming_soon,internal_testing,disabled",
            ),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerStatuses: ["beta", "alpha"],
                capabilityStatuses: ["coming_soon", "internal_testing", "disabled"],
            }),
        );
    });

    it("forwards provider and model routing status filters to the catalogue layer", async () => {
        const response = await handleModels(
            new Request(
                "https://api.example.com/?provider_routing_status=deranked_lvl1,disabled&model_routing_status=active,deranked_lvl2",
            ),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerRoutingStatuses: ["deranked_lvl1", "disabled"],
                modelRoutingStatuses: ["active", "deranked_lvl2"],
            }),
        );
    });

    it("forwards status filters to the catalogue layer", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/?status=active,retired"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ statuses: ["active", "retired"] }),
        );
    });
});
