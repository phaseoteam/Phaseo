import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();
const fetchGatewayContextMock = vi.fn();
const privateModelRows = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => null,
    getSupabaseAdmin: () => ({
        from: () => {
            const query: any = {
                select: () => query,
                eq: () => query,
                order: async () => ({ data: privateModelRows.rows, error: null }),
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

import { handleModelEndpoints, handleModels, handleMyModels } from "./models";

function buildCatalogueModel(overrides: Record<string, unknown> = {}) {
    const model = {
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
        provider_pricing: {},
        provider_endpoint_pricing: {},
        provider_endpoint_capabilities: {},
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
    if (!("provider_endpoint_capabilities" in overrides)) {
        model.provider_endpoint_capabilities = Object.fromEntries(
            model.providers.map((provider: any) => [
                provider.api_provider_id,
                Object.fromEntries(
                    provider.endpoints.map((endpoint: string) => [
                        endpoint,
                        { ...provider, endpoints: [endpoint] },
                    ]),
                ),
            ]),
        );
    }
    return model;
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
            resolvedModel: "phaseo/free",
            providers: [],
            pricing: {},
        });
        privateModelRows.rows = [];
    });

    it("adds only the authenticated workspace's private model metadata", async () => {
        privateModelRows.rows = [{
            model_id: "acme/legal-assistant",
            name: "Legal Assistant",
            description: "Internal legal model.",
            supports_responses: true,
            input_modalities: ["text"],
            output_modalities: ["text"],
            context_length: 32_000,
            max_output_tokens: 4_096,
            created_at: "2026-09-04T00:00:00Z",
        }];
        const response = await handleModels(new Request("https://api.example.com/"));
        const payload = await response.json() as any;

        expect(payload.models[0]).toMatchObject({
            id: "acme/legal-assistant",
            organization: { id: "private", name: "Private" },
            capabilities: { endpoints: ["chat/completions", "messages", "responses"] },
        });
        expect(JSON.stringify(payload)).not.toContain("base_url");
        expect(JSON.stringify(payload)).not.toContain("upstream_model_id");
        expect(response.headers.get("vary")).toBe("Authorization");
    });

    it("merges an attached private offer into its catalogue model", async () => {
        privateModelRows.rows = [{
            model_id: "openai/gpt-4o-mini",
            name: "Dedicated GPT-4o Mini",
            supports_responses: true,
            input_modalities: ["text"],
            output_modalities: ["text"],
            created_at: "2026-09-04T00:00:00Z",
        }];

        const response = await handleModels(new Request("https://api.example.com/"));
        const payload = await response.json() as any;

        expect(payload.models).toHaveLength(1);
        expect(payload.models[0]).toMatchObject({
            id: "openai/gpt-4o-mini",
            availability: { provider_count: 2, active_provider_count: 2 },
        });
        expect(payload.models[0].offers.map((offer: any) => offer.provider.id)).toEqual([
            "openai",
            "private-model",
        ]);
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

    it("returns structured Phaseo capabilities and provider offers", async () => {
        const response = await handleModels(
            new Request("https://api.example.com/"),
            "shared",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            models: [
                {
                    id: "openai/gpt-4o-mini",
                    description: "A compact model for fast text generation.",
                    capabilities: {
                        parameters: ["temperature"],
                        parameter_details: {
                            temperature: {
                                supported: true,
                                range: [0, 2],
                                providers: ["openai"],
                            },
                        },
                    },
                    offers: [{
                        provider: { id: "openai", name: "OpenAI" },
                        capabilities: {
                            parameters: ["temperature"],
                            parameter_details: {
                                temperature: {
                                    supported: true,
                                    range: [0, 2],
                                },
                            },
                        },
                    }],
                },
            ],
        });
    });

    it("prefers an explicit recommended successor over inferred lineage", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({ model_id: "openai/gpt-old", replacement_model_id: "openai/gpt-alternate" }),
            buildCatalogueModel({ model_id: "openai/gpt-next", previous_model_id: "openai/gpt-old" }),
        ]);

        const response = await handleModels(new Request("https://api.example.com/"));

        expect(response.status).toBe(200);
        const body = await response.json() as { models: Array<{ id: string; lifecycle: { replacement_id: string | null } }> };
        expect(body.models.find((model) => model.id === "openai/gpt-old")?.lifecycle.replacement_id).toBe("openai/gpt-alternate");
    });

    it("returns context limits from canonical model details", async () => {
        fetchCatalogueMock.mockResolvedValue([buildCatalogueModel({
            details: { input_context_length: 128000, output_context_length: 16384 },
        })]);

        const response = await handleModels(new Request("https://api.example.com/"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            models: [{ limits: { input_tokens: 128000, output_tokens: 16384 } }],
        });
    });

    it("rejects empty and non-positive context-limit details", async () => {
        fetchCatalogueMock.mockResolvedValue([buildCatalogueModel({
            details: {
                input_context_length: null,
                context_length: "",
                output_context_length: -1,
            },
        })]);

        const response = await handleModels(new Request("https://api.example.com/"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            models: [{ limits: { input_tokens: null, output_tokens: null } }],
        });
    });

    it("returns voice capability metadata through supported parameter detail aliases", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                model_id: "spacex-ai/grok-tts",
                name: "Grok TTS",
                endpoints: ["audio/speech"],
                input_types: ["text"],
                output_types: ["audio_tts"],
                providers: [
                    {
                        api_provider_id: "spacex-ai",
                        api_provider_name: "SpaceXAI",
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
                        providers: ["spacex-ai"],
                    },
                    response_format: {
                        supported: true,
                        type: "enum",
                        values: ["mp3", "opus", "wav"],
                        default: "mp3",
                        providers: ["spacex-ai"],
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
                    id: "spacex-ai/grok-tts",
                    capabilities: {
                        parameters: ["response_format", "voice"],
                        parameter_details: {
                            voice: {
                                supported: true,
                                values: ["aurora", "cedar", "orion"],
                                providers: ["spacex-ai"],
                            },
                        },
                    },
                    offers: [{
                        provider: { id: "spacex-ai" },
                        capabilities: {
                            parameters: ["response_format", "voice"],
                            parameter_details: {
                                voice: {
                                    supported: true,
                                    values: ["aurora", "cedar", "orion"],
                                },
                            },
                        },
                    }],
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
                    id: "openai/sora",
                    capabilities: {
                        endpoints: ["video.generate"],
                        parameters: ["duration", "resolution"],
                        parameter_details: {
                            resolution: {
                                supported: true,
                                values: ["720p", "1080p"],
                                providers: ["openai"],
                            },
                        },
                    },
                    offers: [{
                        provider: { id: "openai" },
                        endpoints: ["video.generate"],
                        capabilities: {
                            parameters: ["duration", "resolution"],
                            parameter_details: {
                                resolution: {
                                    supported: true,
                                    values: ["720p", "1080p"],
                                },
                            },
                        },
                    }],
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
            resolvedModel: "phaseo/free",
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
                    id: "phaseo/free",
                    name: "Phaseo Free Router",
                    capabilities: {
                        parameters: ["temperature", "top_p"],
                    },
                    pricing: {
                        meters: {
                            input_text_tokens: {
                                provider_id: "openai",
                                price_per_unit: "0",
                            },
                        },
                    },
                },
                {
                    id: "openai/gpt-free-b",
                },
            ],
        });
    });

    it("skips the free router model when endpoint filters exclude text surfaces", async () => {
        fetchGatewayContextMock.mockResolvedValue({
            resolvedModel: "phaseo/free",
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
                    id: "openai/gpt-4o-mini",
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
                    id: "openai/gpt-4o-mini",
                    availability: {
                        status: "coming_soon",
                    },
                    offers: [
                        {
                            provider: { id: "openai" },
                            status: "coming_soon",
                            status_reason: "scheduled",
                            routing: { capability: "internal_testing" },
                        },
                    ],
                },
            ],
        });
    });

    it("accepts public modality and parameter filter aliases", async () => {
        const response = await handleModels(
            new Request(
                "https://api.example.com/?input_modalities=text&output_modalities=image&supported_parameters=quality,size",
            ),
        );

        expect(response.status).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({
                inputTypes: ["text"],
                outputTypes: ["image"],
                params: ["quality", "size"],
            }),
        );
    });

    it("returns a controlled 400 for malformed endpoint path encoding", async () => {
        const response = await handleModelEndpoints(
            new Request("https://api.example.com/v1/models/%E0%A4%A/example/endpoints"),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual(expect.objectContaining({
            error: "invalid_request",
        }));
        expect(guardAuthMock).not.toHaveBeenCalled();
    });

    it("returns provider-specific endpoint capability rows across modalities", async () => {
        const endpointDefinitions = [
            { endpoint: "responses", input: ["text"], output: ["text"], params: ["temperature"] },
            { endpoint: "images.generations", input: ["text"], output: ["image"], params: ["size"] },
            { endpoint: "video.generation", input: ["text"], output: ["video"], params: ["duration"] },
            { endpoint: "audio.speech", input: ["text"], output: ["audio"], params: ["voice"] },
        ];
        const baseModel = buildCatalogueModel({
            model_id: "phaseo/multimodal-test",
            aliases: ["phaseo/multimodal-alias"],
            endpoints: endpointDefinitions.map((item) => item.endpoint),
            input_types: ["text"],
            output_types: ["text", "image", "video", "audio"],
        });
        fetchCatalogueMock.mockImplementation(async (filters: { endpoints?: string[] }) => {
            if (!filters.endpoints?.length) return [baseModel];
            const definitions = endpointDefinitions.filter((item) =>
                filters.endpoints?.includes(item.endpoint),
            );
            if (!definitions.length) return [];
            const provider = {
                api_provider_id: "provider-a",
                api_provider_name: "Provider A",
                provider_model_slug: "multimodal-v1",
                is_active_gateway: true,
                availability_status: "active",
                availability_reason: "active",
                provider_status: "active",
                provider_routing_status: "active",
                model_routing_status: "active",
                capability_status: "active",
                effective_from: null,
                effective_to: null,
                endpoints: definitions.map((item) => item.endpoint),
                input_modalities: Array.from(new Set(definitions.flatMap((item) => item.input))),
                output_modalities: Array.from(new Set(definitions.flatMap((item) => item.output))),
                params: Array.from(new Set(definitions.flatMap((item) => item.params))),
                params_detail: Object.fromEntries(
                    definitions.flatMap((item) => item.params).map((param) => [param, { supported: true }]),
                ),
            };
            return [buildCatalogueModel({
                ...baseModel,
                endpoints: definitions.map((item) => item.endpoint),
                providers: [provider],
                provider_endpoint_capabilities: {
                    "provider-a": Object.fromEntries(definitions.map((definition) => [
                        definition.endpoint,
                        {
                            ...provider,
                            endpoints: [definition.endpoint],
                            input_modalities: definition.input,
                            output_modalities: definition.output,
                            params: definition.params,
                            params_detail: Object.fromEntries(
                                definition.params.map((param) => [param, { supported: true }]),
                            ),
                        },
                    ])),
                },
                supported_params: provider.params,
                provider_pricing: {
                    "provider-a": {
                        pricing_plan: "standard",
                        meters: {
                            input_tokens: {
                                provider_id: "provider-a",
                                unit: "token",
                                unit_size: 1000,
                                price_per_unit: "0.5",
                                currency: "USD",
                            },
                        },
                    },
                },
                provider_endpoint_pricing: {
                    "provider-a": Object.fromEntries(definitions.map((definition) => [
                        definition.endpoint,
                        {
                            pricing_plan: "standard",
                            meters: definition.endpoint === "responses" ? {
                                input_tokens: {
                                    provider_id: "provider-a",
                                    unit: "token",
                                    unit_size: 1000,
                                    price_per_unit: "0.5",
                                    currency: "USD",
                                },
                            } : {},
                        },
                    ])),
                },
            })];
        });

        const response = await handleModelEndpoints(
            new Request("https://api.example.com/v1/models/phaseo/multimodal-test/endpoints"),
        );

        expect(response.status).toBe(200);
        const payload = await response.json() as { endpoints: Array<Record<string, unknown>> };
        expect(payload.endpoints).toHaveLength(4);
        expect(fetchCatalogueMock).toHaveBeenCalledTimes(2);
        expect(payload.endpoints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                endpoint: "responses",
                public_path: "/v1/responses",
                collection: "text",
                provider: { id: "provider-a", name: "Provider A" },
                model: "multimodal-v1",
                modalities: { input: ["text"], output: ["text"] },
                capabilities: expect.objectContaining({ parameters: ["temperature"] }),
                pricing: expect.objectContaining({
                    meters: expect.objectContaining({
                        input_tokens: expect.objectContaining({ provider_id: "provider-a" }),
                    }),
                }),
            }),
            expect.objectContaining({ endpoint: "images.generations", collection: "images" }),
            expect.objectContaining({ endpoint: "video.generation", collection: "video" }),
            expect.objectContaining({ endpoint: "audio.speech", collection: "audio" }),
        ]));
    });

    it("includes non-routable endpoint states only when availability=all", async () => {
        const model = buildCatalogueModel({
            model_id: "phaseo/preview-model",
            endpoints: ["responses"],
            providers: [{
                api_provider_id: "provider-preview",
                api_provider_name: "Provider Preview",
                provider_model_slug: "preview-v1",
                is_active_gateway: false,
                availability_status: "coming_soon",
                availability_reason: "scheduled",
                provider_status: "beta",
                provider_routing_status: "active",
                model_routing_status: "active",
                capability_status: "coming_soon",
                effective_from: "2026-08-01T00:00:00Z",
                effective_to: null,
                endpoints: ["responses"],
                input_modalities: ["text"],
                output_modalities: ["text"],
                params: [],
                params_detail: {},
            }],
        });
        fetchCatalogueMock.mockResolvedValue([model]);

        const response = await handleModelEndpoints(
            new Request("https://api.example.com/v1/models/phaseo/preview-model/endpoints?availability=all"),
        );

        expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
        expect(fetchCatalogueMock).toHaveBeenCalledWith(
            expect.objectContaining({ availability: "all" }),
        );
        await expect(response.json()).resolves.toMatchObject({
            availability_mode: "all",
            endpoints: [{
                status: "coming_soon",
                status_reason: "scheduled",
                routing: { capability: "coming_soon" },
                routable: false,
            }],
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
                    id: "anthropic/claude-sonnet-4",
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
            total: 1,
            models: [
                {
                    id: "openai/gpt-4o-mini",
                    name: "GPT-4o Mini",
                    base_model_id: "openai/gpt-4o-mini",
                    variant: "standard",
                    variants: {
                        standard: {
                            model_id: "openai/gpt-4o-mini",
                            name: "GPT-4o Mini",
                        },
                    },
                },
            ],
        });
    });

    it("returns standard and free variants as separate linked models", async () => {
        fetchCatalogueMock.mockResolvedValue([
            buildCatalogueModel({
                model_id: "poolside/laguna-s-2.1",
                base_model_id: "poolside/laguna-s-2.1",
                name: "Laguna S 2.1",
            }),
            buildCatalogueModel({
                model_id: "poolside/laguna-s-2.1:free",
                base_model_id: "poolside/laguna-s-2.1",
                variant_kind: "free",
                name: "Laguna S 2.1 (Free)",
            }),
        ]);

        const response = await handleModels(new Request("https://api.example.com/v1/models"));

        expect(response.status).toBe(200);
        const body = await response.json() as { models: Array<Record<string, unknown>> };
        expect(body.models).toHaveLength(2);
        expect(body.models).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "poolside/laguna-s-2.1",
                variant: "standard",
                variants: {
                    standard: { model_id: "poolside/laguna-s-2.1", name: "Laguna S 2.1" },
                    free: { model_id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
                },
            }),
            expect.objectContaining({
                id: "poolside/laguna-s-2.1:free",
                variant: "free",
                variants: {
                    standard: { model_id: "poolside/laguna-s-2.1", name: "Laguna S 2.1" },
                    free: { model_id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
                },
            }),
        ]));
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
