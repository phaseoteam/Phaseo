import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();
const fetchGatewayContextMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
    guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("./models.catalogue", () => ({
    fetchCatalogue: (...args: any[]) => fetchCatalogueMock(...args),
}));

vi.mock("@pipeline/before/context", () => ({
    fetchGatewayContext: (...args: any[]) => fetchGatewayContextMock(...args),
}));

import { handleModels, handleMyModels } from "./models";

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
                params_detail: {
                    temperature: {
                        supported: true,
                        range: [0, 2],
                    },
                },
            },
        ],
        supported_params: ["temperature"],
        supported_params_detail: {
            temperature: {
                supported: true,
                range: [0, 2],
                providers: ["openai"],
            },
        },
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
        fetchGatewayContextMock.mockReset();
        guardAuthMock.mockResolvedValue({
            ok: true,
            value: {
                workspaceId: "ws_test",
                apiKeyId: "key_test",
            },
        });
        fetchCatalogueMock.mockResolvedValue([buildCatalogueModel()]);
        fetchGatewayContextMock.mockResolvedValue({
            resolvedModel: "ai-stats/free",
            providers: [],
            pricing: {},
        });
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

    it("returns structured supported parameter metadata alongside legacy parameter arrays", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/"),
            "shared",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            models: [
                {
                    model_id: "openai/gpt-4o-mini",
                    supported_parameters: ["temperature"],
                    supported_params_detail: {
                        temperature: {
                            supported: true,
                            range: [0, 2],
                            providers: ["openai"],
                        },
                    },
                    supported_parameters_detail: {
                        temperature: {
                            supported: true,
                            range: [0, 2],
                            providers: ["openai"],
                        },
                    },
                    providers: [
                        {
                            api_provider_id: "openai",
                            params: ["temperature"],
                            supported_parameters: ["temperature"],
                            params_detail: {
                                temperature: {
                                    supported: true,
                                    range: [0, 2],
                                },
                            },
                            supported_parameters_detail: {
                                temperature: {
                                    supported: true,
                                    range: [0, 2],
                                },
                            },
                        },
                    ],
                },
            ],
        });
    });

    it("returns voice capability metadata through supported parameter detail aliases", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                model_id: "x-ai/grok-tts",
                name: "Grok TTS",
                endpoints: ["audio/speech"],
                input_types: ["text"],
                output_types: ["audio_tts"],
                providers: [
                    {
                        api_provider_id: "x-ai",
                        api_provider_name: "xAI",
                        is_active_gateway: true,
                        availability_status: "active",
                        availability_reason: "active",
                        provider_status: "active",
                        provider_routing_status: "active",
                        model_routing_status: "active",
                        capability_status: "active",
                        effective_from: null,
                        effective_to: null,
                        endpoints: ["audio/speech"],
                        params: ["response_format", "voice"],
                        params_detail: {
                            voice: {
                                supported: true,
                                type: "enum",
                                values: ["aurora", "cedar", "orion"],
                                default: "aurora",
                            },
                            response_format: {
                                supported: true,
                                type: "enum",
                                values: ["mp3", "wav", "opus"],
                                default: "mp3",
                            },
                        },
                    },
                ],
                supported_params: ["response_format", "voice"],
                supported_params_detail: {
                    voice: {
                        supported: true,
                        type: "enum",
                        values: ["aurora", "cedar", "orion"],
                        default: "aurora",
                        providers: ["x-ai"],
                    },
                    response_format: {
                        supported: true,
                        type: "enum",
                        values: ["mp3", "opus", "wav"],
                        default: "mp3",
                        providers: ["x-ai"],
                    },
                },
            }),
        ]);

        const response = await handleModels(
            new Request("https://api.example.com/?endpoints=audio/speech"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ endpoints: ["audio/speech"] }),
        );
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            models: [
                {
                    model_id: "x-ai/grok-tts",
                    supported_parameters: ["response_format", "voice"],
                    supported_params_detail: {
                        voice: {
                            supported: true,
                            type: "enum",
                            values: ["aurora", "cedar", "orion"],
                            default: "aurora",
                            providers: ["x-ai"],
                        },
                    },
                    supported_parameters_detail: {
                        voice: {
                            supported: true,
                            type: "enum",
                            values: ["aurora", "cedar", "orion"],
                            default: "aurora",
                            providers: ["x-ai"],
                        },
                    },
                    providers: [
                        {
                            api_provider_id: "x-ai",
                            params: ["response_format", "voice"],
                            supported_parameters: ["response_format", "voice"],
                            params_detail: {
                                voice: {
                                    supported: true,
                                    values: ["aurora", "cedar", "orion"],
                                },
                            },
                            supported_parameters_detail: {
                                voice: {
                                    supported: true,
                                    values: ["aurora", "cedar", "orion"],
                                },
                            },
                        },
                    ],
                },
            ],
        });
    });

    it("returns video capability metadata when filtering by the public videos route", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                model_id: "openai/sora",
                name: "Sora",
                endpoints: ["video.generate"],
                input_types: ["text"],
                output_types: ["video"],
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
                        endpoints: ["video.generate"],
                        params: ["duration", "resolution"],
                        params_detail: {
                            duration: {
                                supported: true,
                                type: "enum",
                                values: [4, 8, 12],
                                default: 4,
                            },
                            resolution: {
                                supported: true,
                                type: "enum",
                                values: ["720p", "1080p"],
                                default: "720p",
                            },
                        },
                    },
                ],
                supported_params: ["duration", "resolution"],
                supported_params_detail: {
                    duration: {
                        supported: true,
                        type: "enum",
                        values: [4, 8, 12],
                        default: 4,
                        providers: ["openai"],
                    },
                    resolution: {
                        supported: true,
                        type: "enum",
                        values: ["720p", "1080p"],
                        default: "720p",
                        providers: ["openai"],
                    },
                },
            }),
        ]);

        const response = await handleModels(
            new Request("https://api.example.com/?endpoints=/v1/videos"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ endpoints: ["/v1/videos"] }),
        );
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            models: [
                {
                    model_id: "openai/sora",
                    endpoints: ["video.generate"],
                    supported_parameters: ["duration", "resolution"],
                    supported_params_detail: {
                        resolution: {
                            supported: true,
                            type: "enum",
                            values: ["720p", "1080p"],
                            default: "720p",
                            providers: ["openai"],
                        },
                    },
                    supported_parameters_detail: {
                        duration: {
                            supported: true,
                            type: "enum",
                            values: [4, 8, 12],
                            default: 4,
                            providers: ["openai"],
                        },
                    },
                    providers: [
                        {
                            api_provider_id: "openai",
                            endpoints: ["video.generate"],
                            supported_parameters: ["duration", "resolution"],
                            supported_parameters_detail: {
                                resolution: {
                                    supported: true,
                                    values: ["720p", "1080p"],
                                },
                            },
                        },
                    ],
                },
            ],
        });
    });

    it("prepends the free router model when the workspace has eligible free providers", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                model_id: "openai/gpt-free-b",
                name: "GPT Free B",
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
                        endpoints: ["responses", "chat/completions"],
                        params: ["temperature"],
                    },
                ],
            }),
        ]);
        fetchGatewayContextMock.mockResolvedValue({
            resolvedModel: "ai-stats/free",
            providers: [
                {
                    providerId: "openai",
                    apiModelId: "openai/gpt-free-b",
                    pricingKey: "openai:openai/gpt-free-b",
                    capabilityParams: {
                        temperature: true,
                        top_p: true,
                    },
                },
            ],
            pricing: {
                "openai:openai/gpt-free-b": {
                    rules: [
                        {
                            meter: "input_text_tokens",
                            unit: "token",
                            unit_size: 1,
                            price_per_unit: "0",
                            currency: "USD",
                        },
                    ],
                },
            },
        });

        const response = await handleModels(
            new Request("https://api.example.com/"),
            "shared",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            total: 2,
            models: [
                {
                    model_id: "ai-stats/free",
                    name: "AI Stats Free Router",
                    providers: [
                        {
                            api_provider_id: "openai",
                            params: ["temperature", "top_p"],
                        },
                    ],
                    supported_params_detail: {
                        temperature: {
                            supported: true,
                            range: [0, 2],
                            providers: ["openai"],
                        },
                        top_p: {
                            supported: true,
                            providers: ["openai"],
                        },
                    },
                    supported_parameters_detail: {
                        temperature: {
                            supported: true,
                            range: [0, 2],
                            providers: ["openai"],
                        },
                        top_p: {
                            supported: true,
                            providers: ["openai"],
                        },
                    },
                    pricing: {
                        prompt: "0",
                    },
                },
                {
                    model_id: "openai/gpt-free-b",
                },
            ],
        });
    });

    it("skips the free router model when endpoint filters exclude text surfaces", async () => {
        fetchGatewayContextMock.mockResolvedValue({
            resolvedModel: "ai-stats/free",
            providers: [
                {
                    providerId: "openai",
                    apiModelId: "openai/gpt-free-b",
                    pricingKey: "openai:openai/gpt-free-b",
                    capabilityParams: {},
                },
            ],
            pricing: {},
        });

        const response = await handleModels(
            new Request("https://api.example.com/?endpoints=embeddings"),
            "shared",
        );

        expect(response.status).toBe(200);
        expect(fetchGatewayContextMock).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            total: 1,
            models: [
                {
                    model_id: "openai/gpt-4o-mini",
                },
            ],
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

    it("filters the returned catalogue by model_id", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel(),
            buildCatalogueModel({
                model_id: "anthropic/claude-sonnet-4",
                name: "Claude Sonnet 4",
                organisation_id: "anthropic",
                organisation_name: "Anthropic",
            }),
        ]);

        const response = await handleModels(
            new Request("https://api.example.com/?model_id=anthropic/claude-sonnet-4"),
            "shared",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            total: 1,
            models: [
                {
                    model_id: "anthropic/claude-sonnet-4",
                    name: "Claude Sonnet 4",
                },
            ],
        });
    });

    it("returns the shared gateway model catalogue from /v1/models", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/v1/models"),
            "shared",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            privacy_scope: "shared",
            total: 1,
            models: [
                {
                    model_id: "openai/gpt-4o-mini",
                    name: "GPT-4o Mini",
                },
            ],
        });
    });

    it("returns a guarded 501 placeholder from /v1/models/me", async () => {
        const response = await handleMyModels(
            new Request("https://api.example.com/v1/models/me"),
        );

        expect(response.status).toBe(501);
        expect(fetchCatalogueMock).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            status_code: 501,
            error: "not_implemented",
        });
    });
});
