import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: getSupabaseAdminMock,
}));

type QueryResult = {
    data: any;
    error: { message?: string; code?: string } | null;
};

type QueryState = {
    emptyCapabilityInCalled: boolean;
};

function buildSupabaseMock(
    responses: Record<string, QueryResult[]>,
    state: QueryState
) {
    return {
        from(table: string) {
            const query = {
                select(_selection: string) {
                    return query;
                },
                eq(_column: string, _value: unknown) {
                    return query;
                },
                in(column: string, values: unknown[]) {
                    if (
                        table === "data_api_provider_model_capabilities" &&
                        column === "provider_api_model_id" &&
                        Array.isArray(values) &&
                        values.length === 0
                    ) {
                        state.emptyCapabilityInCalled = true;
                    }
                    return query;
                },
                or(_filters: string) {
                    return query;
                },
                then<TResult1 = QueryResult, TResult2 = never>(
                    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
                    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
                ) {
                    const queue = responses[table] ?? [];
                    const next = queue.length ? queue.shift()! : { data: [], error: null };
                    return Promise.resolve(next).then(onfulfilled as any, onrejected as any);
                },
            };
            return query;
        },
    };
}

describe("fetchCatalogue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("skips capabilities lookup when there are no provider model ids", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-1",
                            name: "Test Model 1",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "available",
                            organisation_id: null,
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_1",
                            provider_id: "openai",
                            api_model_id: "test/model-1",
                            model_id: "test/model-1",
                            provider_model_slug: "test-model-1",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_1",
                            capability_id: "responses",
                            status: "active",
                            params: {
                                temperature: { type: "number", minimum: 0, maximum: 2 },
                                resolution: ["720p", "1080p"],
                            },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(state.emptyCapabilityInCalled).toBe(false);
        expect(models).toHaveLength(1);
        expect(models[0]?.model_id).toBe("test/model-1");
        expect(models[0]?.supported_params).toEqual(["resolution", "temperature"]);
        expect(models[0]?.supported_params_detail).toMatchObject({
            resolution: {
                supported: true,
                values: ["1080p", "720p"],
                providers: ["openai"],
            },
            temperature: {
                supported: true,
                type: "number",
                minimum: 0,
                maximum: 2,
                providers: ["openai"],
            },
        });
        expect(models[0]?.providers[0]).toMatchObject({
            api_provider_id: "openai",
            params: ["resolution", "temperature"],
            params_detail: {
                resolution: {
                    supported: true,
                    values: ["720p", "1080p"],
                },
            },
        });
    });

    it("preserves legacy object-array capability parameter metadata", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [{
                data: [{
                    model_id: "test/video-model",
                    name: "Test Video Model",
                    release_date: null,
                    deprecation_date: null,
                    retirement_date: null,
                    status: "available",
                    organisation_id: null,
                    input_types: ["text"],
                    output_types: ["video"],
                    organisation: null,
                }],
                error: null,
            }],
            data_api_provider_models: [{
                data: [{
                    provider_api_model_id: "pam_video_1",
                    provider_id: "runway",
                    api_model_id: "test/video-model",
                    model_id: "test/video-model",
                    provider_model_slug: "test-video-model",
                    is_active_gateway: true,
                    routing_status: "active",
                    input_modalities: ["text"],
                    output_modalities: ["video"],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_provider_model_capabilities: [{
                data: [{
                    provider_api_model_id: "pam_video_1",
                    capability_id: "video.generation",
                    status: "active",
                    params: [
                        {
                            param_id: "resolution",
                            type: "enum",
                            values: ["720p", "1080p"],
                            default: "720p",
                        },
                        {
                            param_id: "seconds",
                            type: "integer",
                            minimum: 5,
                            maximum: 10,
                            step: 5,
                        },
                    ],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [{
                data: [{
                    api_provider_id: "runway",
                    api_provider_name: "Runway",
                    link: null,
                    country_code: null,
                    status: "active",
                    routing_status: "active",
                }],
                error: null,
            }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(models).toHaveLength(1);
        expect(models[0]?.supported_params).toEqual(["resolution", "seconds"]);
        expect(models[0]?.supported_params_detail).toMatchObject({
            resolution: {
                supported: true,
                type: "enum",
                values: ["1080p", "720p"],
                default: "720p",
                providers: ["runway"],
            },
            seconds: {
                supported: true,
                type: "integer",
                minimum: 5,
                maximum: 10,
                step: 5,
                providers: ["runway"],
            },
        });
        expect(models[0]?.providers[0]?.params_detail).toMatchObject({
            resolution: {
                supported: true,
                type: "enum",
                values: ["720p", "1080p"],
            },
        });
    });

    it("matches public and route-style video filters to catalogue video.generate capabilities", async () => {
        const buildResponses = (): { state: QueryState; responses: Record<string, QueryResult[]> } => ({
            state: { emptyCapabilityInCalled: false },
            responses: {
                data_models: [{
                    data: [{
                        model_id: "test/mixed-video-model",
                        name: "Mixed Video Model",
                        release_date: null,
                        deprecation_date: null,
                        retirement_date: null,
                        status: "available",
                        organisation_id: null,
                        input_types: ["text"],
                        output_types: ["text", "video"],
                        organisation: null,
                    }],
                    error: null,
                }],
                data_api_provider_models: [{
                    data: [{
                        provider_api_model_id: "pam_mixed_video_1",
                        provider_id: "openai",
                        api_model_id: "test/mixed-video-model",
                        model_id: "test/mixed-video-model",
                        provider_model_slug: "mixed-video-model",
                        is_active_gateway: true,
                        routing_status: "active",
                        input_modalities: ["text"],
                        output_modalities: ["text", "video"],
                        effective_from: null,
                        effective_to: null,
                    }],
                    error: null,
                }],
                data_api_provider_model_capabilities: [{
                    data: [
                        {
                            provider_api_model_id: "pam_mixed_video_1",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_mixed_video_1",
                            capability_id: "video.generate",
                            status: "active",
                            params: {
                                duration: { type: "enum", values: [4, 8, 12], aliases: ["duration_seconds"] },
                                resolution: { type: "enum", values: ["720p", "1080p"], aliases: ["size"] },
                            },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                }],
                data_api_model_aliases: [{ data: [], error: null }],
                data_api_providers: [{
                    data: [{
                        api_provider_id: "openai",
                        api_provider_name: "OpenAI",
                        link: null,
                        country_code: null,
                        status: "active",
                        routing_status: "active",
                    }],
                    error: null,
                }],
                data_api_pricing_rules: [{ data: [], error: null }],
            },
        });

        const { fetchCatalogue } = await import("./models.catalogue");

        for (const endpoint of ["video.generation", "videos", "/v1/videos"]) {
            const { state, responses } = buildResponses();
            getSupabaseAdminMock.mockReturnValueOnce(buildSupabaseMock(responses, state));

            const models = await fetchCatalogue({ endpoints: [endpoint] });

            expect(models).toHaveLength(1);
            expect(models[0]?.endpoints).toEqual(["video.generate"]);
            expect(models[0]?.supported_params).toEqual(["duration", "resolution"]);
            expect(models[0]?.supported_params_detail).toMatchObject({
                duration: {
                    supported: true,
                    type: "enum",
                    values: [12, 4, 8],
                    aliases: ["duration_seconds"],
                    providers: ["openai"],
                },
                resolution: {
                    supported: true,
                    type: "enum",
                    values: ["1080p", "720p"],
                    aliases: ["size"],
                    providers: ["openai"],
                },
            });
            expect(models[0]?.providers[0]).toMatchObject({
                api_provider_id: "openai",
                endpoints: ["video.generate"],
                params: ["duration", "resolution"],
            });
        }

        for (const param of ["duration_seconds", "size"]) {
            const { state, responses } = buildResponses();
            getSupabaseAdminMock.mockReturnValueOnce(buildSupabaseMock(responses, state));

            const models = await fetchCatalogue({ endpoints: ["video.generate"], params: [param] });

            expect(models).toHaveLength(1);
            expect(models[0]?.model_id).toBe("test/mixed-video-model");
            expect(models[0]?.supported_params).toEqual(["duration", "resolution"]);
        }
    });

    it("preserves voice and format capability metadata for audio speech models", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [{
                data: [{
                    model_id: "spacex-ai/grok-tts",
                    name: "Grok TTS",
                    release_date: null,
                    deprecation_date: null,
                    retirement_date: null,
                    status: "available",
                    organisation_id: null,
                    input_types: ["text"],
                    output_types: ["audio_tts"],
                    organisation: null,
                }],
                error: null,
            }],
            data_api_provider_models: [{
                data: [{
                    provider_api_model_id: "pam_voice_1",
                    provider_id: "spacex-ai",
                    api_model_id: "spacex-ai/grok-tts",
                    model_id: "spacex-ai/grok-tts",
                    provider_model_slug: "grok-tts",
                    is_active_gateway: true,
                    routing_status: "active",
                    input_modalities: ["text"],
                    output_modalities: ["audio"],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_provider_model_capabilities: [{
                data: [{
                    provider_api_model_id: "pam_voice_1",
                    capability_id: "audio/speech",
                    status: "active",
                    params: [
                        {
                            param_id: "voice",
                            type: "enum",
                            values: ["aurora", "cedar", "orion"],
                            default: "aurora",
                        },
                        {
                            param_id: "response_format",
                            type: "enum",
                            values: ["mp3", "wav", "opus"],
                            default: "mp3",
                        },
                    ],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [{
                data: [{
                    api_provider_id: "spacex-ai",
                    api_provider_name: "SpaceXAI",
                    link: null,
                    country_code: null,
                    status: "active",
                    routing_status: "active",
                }],
                error: null,
            }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ endpoints: ["audio/speech"] as any });

        expect(models).toHaveLength(1);
        expect(models[0]?.supported_params).toEqual(["response_format", "voice"]);
        expect(models[0]?.supported_params_detail).toMatchObject({
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
        });
        expect(models[0]?.providers[0]?.params_detail).toMatchObject({
            voice: {
                supported: true,
                type: "enum",
                values: ["aurora", "cedar", "orion"],
            },
            response_format: {
                supported: true,
                type: "enum",
                values: ["mp3", "wav", "opus"],
            },
        });
    });

    it("falls back when capability effective window columns are missing from the schema", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [{
                data: [{
                    model_id: "test/model-1",
                    name: "Test Model 1",
                    release_date: null,
                    deprecation_date: null,
                    retirement_date: null,
                    status: "available",
                    organisation_id: null,
                    input_types: ["text"],
                    output_types: ["text"],
                    organisation: null,
                }],
                error: null,
            }],
            data_api_provider_models: [{
                data: [{
                    provider_api_model_id: "pam_1",
                    provider_id: "google-ai-studio",
                    api_model_id: "test/model-1",
                    model_id: "test/model-1",
                    provider_model_slug: "test-model-1",
                    is_active_gateway: true,
                    routing_status: "active",
                    input_modalities: ["text"],
                    output_modalities: ["image"],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_provider_model_capabilities: [
                {
                    data: null,
                    error: {
                        code: "PGRST204",
                        message: "Could not find the 'effective_from' column of 'data_api_provider_model_capabilities' in the schema cache",
                    },
                },
                {
                    data: [{
                        provider_api_model_id: "pam_1",
                        capability_id: "responses",
                        status: "active",
                        params: { modalities: true },
                    }],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [{
                data: [{
                    api_provider_id: "google-ai-studio",
                    api_provider_name: "Google AI Studio",
                    link: null,
                    country_code: null,
                    status: "active",
                    routing_status: "active",
                }],
                error: null,
            }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(models).toHaveLength(1);
        expect(models[0]?.providers[0]?.api_provider_id).toBe("google-ai-studio");
        expect(models[0]?.endpoints).toContain("responses");
    });

    it("filters models by requested statuses", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-active",
                            name: "Active Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: null,
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                        {
                            model_id: "test/model-retired",
                            name: "Retired Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "retired",
                            organisation_id: null,
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_active",
                            provider_id: "openai",
                            api_model_id: "test/model-active",
                            model_id: "test/model-active",
                            provider_model_slug: "active-model",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_retired",
                            provider_id: "openai",
                            api_model_id: "test/model-retired",
                            model_id: "test/model-retired",
                            provider_model_slug: "retired-model",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_active",
                            capability_id: "responses",
                            status: "active",
                            params: {},
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_retired",
                            capability_id: "responses",
                            status: "active",
                            params: {},
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ statuses: ["active"] });

        expect(models).toHaveLength(1);
        expect(models[0]?.model_id).toBe("test/model-active");
    });

    it("filters provider entries by requested providers and recomputes derived model fields", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-multi-provider",
                            name: "Multi Provider Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                        {
                            model_id: "test/model-openai-only",
                            name: "OpenAI Only Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            model_id: "test/model-capability-soon",
                            name: "Capability Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            model_id: "test/model-capability-soon",
                            name: "Capability Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            model_id: "test/model-capability-soon",
                            name: "Capability Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_multi",
                            provider_id: "openai",
                            api_model_id: "test/model-multi-provider",
                            model_id: "test/model-multi-provider",
                            provider_model_slug: "gpt-multi",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_multi",
                            provider_id: "anthropic",
                            api_model_id: "test/model-multi-provider",
                            model_id: "test/model-multi-provider",
                            provider_model_slug: "claude-multi",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_openai_only",
                            provider_id: "openai",
                            api_model_id: "test/model-openai-only",
                            model_id: "test/model-openai-only",
                            provider_model_slug: "gpt-openai-only",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-capability-soon",
                            model_id: "test/model-capability-soon",
                            provider_model_slug: "gpt-capability-soon",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-capability-soon",
                            model_id: "test/model-capability-soon",
                            provider_model_slug: "gpt-capability-soon",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-capability-soon",
                            model_id: "test/model-capability-soon",
                            provider_model_slug: "gpt-capability-soon",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_multi",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_multi",
                            capability_id: "messages",
                            status: "active",
                            params: { top_k: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_openai_only",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            capability_id: "responses",
                            status: "coming_soon",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }, { data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                        {
                            api_provider_id: "anthropic",
                            api_provider_name: "Anthropic",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [
                {
                    data: [
                        {
                            model_key: "openai:test/model-multi-provider:responses",
                            capability_id: "responses",
                            pricing_plan: "standard",
                            meter: "input_tokens",
                            unit: "token",
                            unit_size: 1,
                            price_per_unit: "2",
                            currency: "USD",
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            model_key: "anthropic:test/model-multi-provider:messages",
                            capability_id: "messages",
                            pricing_plan: "standard",
                            meter: "input_tokens",
                            unit: "token",
                            unit_size: 1,
                            price_per_unit: "1",
                            currency: "USD",
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                { data: [], error: null },
            ],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ providerIds: ["anthropic"] });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-multi-provider",
            endpoints: ["messages"],
            supported_params: ["top_k"],
            top_provider: "anthropic",
            availability: {
                status: "active",
                provider_count: 1,
                active_provider_count: 1,
                inactive_provider_count: 0,
            },
            providers: [
                {
                    api_provider_id: "anthropic",
                    endpoints: ["messages"],
                    params: ["top_k"],
                },
            ],
        });
        expect(models[0]?.pricing.meters.input_tokens?.provider_id).toBe("anthropic");
        expect(models[0]?.pricing.meters.output_tokens).toBeNull();
    });

    it("collapses same-provider availability deterministically when statuses tie", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-provider-collapse",
                            name: "Provider Collapse Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_active",
                            provider_id: "openai",
                            api_model_id: "test/model-provider-collapse",
                            model_id: "test/model-provider-collapse",
                            provider_model_slug: "collapse-a",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_openai_deranked",
                            provider_id: "openai",
                            api_model_id: "test/model-provider-collapse",
                            model_id: "test/model-provider-collapse",
                            provider_model_slug: "collapse-z",
                            is_active_gateway: true,
                            routing_status: "deranked_lvl2",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_active",
                            capability_id: "chat/completions",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_openai_deranked",
                            capability_id: "responses",
                            status: "active",
                            params: { top_p: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(models).toHaveLength(1);
        expect(models[0]?.providers).toMatchObject([
            {
                api_provider_id: "openai",
                availability_status: "active",
                availability_reason: "deranked_lvl2",
                provider_routing_status: "active",
                model_routing_status: "deranked_lvl2",
                endpoints: ["chat/completions", "responses"],
                params: ["temperature", "top_p"],
            },
        ]);
    });

    it("filters provider entries by availability status and reason and recomputes model availability", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-rollout",
                            name: "Rollout Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_active",
                            provider_id: "openai",
                            api_model_id: "test/model-rollout",
                            model_id: "test/model-rollout",
                            provider_model_slug: "gpt-rollout",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_scheduled",
                            provider_id: "anthropic",
                            api_model_id: "test/model-rollout",
                            model_id: "test/model-rollout",
                            provider_model_slug: "claude-rollout",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_active",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_scheduled",
                            capability_id: "responses",
                            status: "active",
                            params: { top_k: true },
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            capability_id: "responses",
                            status: "coming_soon",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }, { data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                        {
                            api_provider_id: "anthropic",
                            api_provider_name: "Anthropic",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }, { data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({
            availability: "all",
            providerAvailabilityStatuses: ["coming_soon"],
            providerAvailabilityReasons: ["scheduled"],
        });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-rollout",
            endpoints: ["responses"],
            supported_params: ["top_k"],
            availability: {
                status: "coming_soon",
                provider_count: 1,
                active_provider_count: 0,
                inactive_provider_count: 0,
            },
            providers: [
                {
                    api_provider_id: "anthropic",
                    availability_status: "coming_soon",
                    availability_reason: "scheduled",
                    endpoints: ["responses"],
                    params: ["top_k"],
                },
            ],
        });
    });

    it("filters provider entries by provider and capability status", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-status-gates",
                            name: "Status Gates Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_beta",
                            provider_id: "openai",
                            api_model_id: "test/model-status-gates",
                            model_id: "test/model-status-gates",
                            provider_model_slug: "gpt-status-gates",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_active",
                            provider_id: "anthropic",
                            api_model_id: "test/model-status-gates",
                            model_id: "test/model-status-gates",
                            provider_model_slug: "claude-status-gates",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_beta",
                            capability_id: "responses",
                            status: "internal_testing",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_active",
                            capability_id: "responses",
                            status: "active",
                            params: { top_k: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            capability_id: "responses",
                            status: "coming_soon",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }, { data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "beta",
                            routing_status: "active",
                        },
                        {
                            api_provider_id: "anthropic",
                            api_provider_name: "Anthropic",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }, { data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({
            availability: "all",
            providerStatuses: ["beta"],
            capabilityStatuses: ["internal_testing"],
        });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-status-gates",
            endpoints: ["responses"],
            supported_params: ["temperature"],
            availability: {
                status: "coming_soon",
                provider_count: 1,
                active_provider_count: 0,
                inactive_provider_count: 0,
            },
            providers: [
                {
                    api_provider_id: "openai",
                    provider_status: "beta",
                    capability_status: "internal_testing",
                    availability_status: "coming_soon",
                    availability_reason: "preview_only",
                    endpoints: ["responses"],
                    params: ["temperature"],
                },
            ],
        });
    });

    it("surfaces provider_status=not_ready as provider_not_ready instead of generic inactivity", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-provider-not-ready",
                            name: "Provider Not Ready Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_not_ready",
                            provider_id: "openai",
                            api_model_id: "test/model-provider-not-ready",
                            model_id: "test/model-provider-not-ready",
                            provider_model_slug: "gpt-provider-not-ready",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_not_ready",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "not_ready",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({
            availability: "all",
            providerAvailabilityReasons: ["provider_not_ready"],
        });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-provider-not-ready",
            availability: {
                status: "inactive",
                provider_count: 1,
                active_provider_count: 0,
                inactive_provider_count: 1,
            },
            providers: [
                {
                    api_provider_id: "openai",
                    provider_status: "not_ready",
                    capability_status: "active",
                    availability_status: "inactive",
                    availability_reason: "provider_not_ready",
                },
            ],
        });
    });

    it.each([
        ["gated", "gated"],
        ["access_limited", "access_limited"],
        ["region_limited", "region_limited"],
        ["project_limited", "project_limited"],
        ["paused", "paused"],
        ["soft_blocked", "soft_blocked"],
    ] as const)(
        "surfaces provider_status=%s as %s instead of generic inactivity",
        async (providerStatus, availabilityReason) => {
            const state: QueryState = { emptyCapabilityInCalled: false };
            const modelId = `test/model-${providerStatus}`;
            const providerApiModelId = `pam_openai_${providerStatus}`;
            const responses: Record<string, QueryResult[]> = {
                data_models: [
                    {
                        data: [
                            {
                                model_id: modelId,
                                name: `Model ${providerStatus}`,
                                release_date: null,
                                deprecation_date: null,
                                retirement_date: null,
                                status: "active",
                                organisation_id: "openai",
                                input_types: ["text"],
                                output_types: ["text"],
                                organisation: null,
                            },
                        ],
                        error: null,
                    },
                ],
                data_api_provider_models: [
                    {
                        data: [
                            {
                                provider_api_model_id: providerApiModelId,
                                provider_id: "openai",
                                api_model_id: modelId,
                                model_id: modelId,
                                provider_model_slug: `slug-${providerStatus}`,
                                is_active_gateway: true,
                                routing_status: "active",
                                input_modalities: ["text"],
                                output_modalities: ["text"],
                                effective_from: null,
                                effective_to: null,
                            },
                        ],
                        error: null,
                    },
                ],
                data_api_provider_model_capabilities: [
                    {
                        data: [
                            {
                                provider_api_model_id: providerApiModelId,
                                capability_id: "responses",
                                status: "active",
                                params: { temperature: true },
                                effective_from: null,
                                effective_to: null,
                            },
                        ],
                        error: null,
                    },
                ],
                data_api_model_aliases: [{ data: [], error: null }],
                data_api_providers: [
                    {
                        data: [
                            {
                                api_provider_id: "openai",
                                api_provider_name: "OpenAI",
                                link: null,
                                country_code: null,
                                status: providerStatus,
                                routing_status: "active",
                            },
                        ],
                        error: null,
                    },
                ],
                data_api_pricing_rules: [{ data: [], error: null }],
            };

            getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
            const { fetchCatalogue } = await import("./models.catalogue");

            const models = await fetchCatalogue({
                availability: "all",
                providerAvailabilityReasons: [availabilityReason],
            });

            expect(models).toHaveLength(1);
            expect(models[0]).toMatchObject({
                model_id: modelId,
                availability: {
                    status: "inactive",
                    provider_count: 1,
                    active_provider_count: 0,
                    inactive_provider_count: 1,
                },
                providers: [
                    {
                        api_provider_id: "openai",
                        provider_status: providerStatus,
                        capability_status: "active",
                        availability_status: "inactive",
                        availability_reason: availabilityReason,
                    },
                ],
            });
        }
    );

    it("keeps capability_status=coming_soon distinct from active routing", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-capability-soon",
                            name: "Capability Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            model_id: "test/model-capability-soon",
                            name: "Capability Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-capability-soon",
                            model_id: "test/model-capability-soon",
                            provider_model_slug: "gpt-capability-soon",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-capability-soon",
                            model_id: "test/model-capability-soon",
                            provider_model_slug: "gpt-capability-soon",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            capability_id: "responses",
                            status: "coming_soon",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_capability_soon",
                            capability_id: "responses",
                            status: "coming_soon",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }, { data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }, { data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const activeOnlyModels = await fetchCatalogue({});
        expect(activeOnlyModels).toHaveLength(0);

        const models = await fetchCatalogue({
            availability: "all",
            capabilityStatuses: ["coming_soon"],
        });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-capability-soon",
            availability: {
                status: "coming_soon",
                provider_count: 1,
                active_provider_count: 0,
                inactive_provider_count: 0,
            },
            providers: [
                {
                    api_provider_id: "openai",
                    capability_status: "coming_soon",
                    availability_status: "coming_soon",
                    availability_reason: "coming_soon",
                    endpoints: ["responses"],
                    params: ["temperature"],
                },
            ],
        });
    });

    it("filters provider entries by provider and model routing status", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-routing-gates",
                            name: "Routing Gates Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_deranked",
                            provider_id: "openai",
                            api_model_id: "test/model-routing-gates",
                            model_id: "test/model-routing-gates",
                            provider_model_slug: "gpt-routing-gates",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_disabled",
                            provider_id: "anthropic",
                            api_model_id: "test/model-routing-gates",
                            model_id: "test/model-routing-gates",
                            provider_model_slug: "claude-routing-gates",
                            is_active_gateway: true,
                            routing_status: "deranked_lvl2",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_openai_deranked",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_anthropic_disabled",
                            capability_id: "responses",
                            status: "active",
                            params: { top_k: true },
                            effective_from: null,
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "deranked_lvl1",
                        },
                        {
                            api_provider_id: "anthropic",
                            api_provider_name: "Anthropic",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "disabled",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({
            availability: "all",
            providerRoutingStatuses: ["deranked_lvl1"],
            modelRoutingStatuses: ["active"],
        });

        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            model_id: "test/model-routing-gates",
            endpoints: ["responses"],
            supported_params: ["temperature"],
            availability: {
                status: "active",
                provider_count: 1,
                active_provider_count: 1,
                inactive_provider_count: 0,
            },
            providers: [
                {
                    api_provider_id: "openai",
                    provider_routing_status: "deranked_lvl1",
                    model_routing_status: "active",
                    availability_status: "active",
                    availability_reason: "deranked_lvl1",
                    endpoints: ["responses"],
                    params: ["temperature"],
                },
            ],
        });
    });

    it("keeps default availability mode limited to publicly routable providers", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-active",
                            name: "Active Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                        {
                            model_id: "test/model-soon",
                            name: "Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_active",
                            provider_id: "openai",
                            api_model_id: "test/model-active",
                            model_id: "test/model-active",
                            provider_model_slug: "gpt-active",
                            is_active_gateway: true,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-soon",
                            model_id: "test/model-soon",
                            provider_model_slug: "gpt-soon",
                            is_active_gateway: false,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_active",
                            capability_id: "responses",
                            status: "active",
                            params: { temperature: true },
                            effective_from: null,
                            effective_to: null,
                        },
                        {
                            provider_api_model_id: "pam_soon",
                            capability_id: "responses",
                            status: "internal_testing",
                            params: { temperature: true },
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "active",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(models).toHaveLength(1);
        expect(models[0]?.model_id).toBe("test/model-active");
        expect(models[0]?.availability.status).toBe("active");
        expect(models[0]?.providers[0]).toMatchObject({
            api_provider_id: "openai",
            availability_status: "active",
            availability_reason: "active",
        });
    });

    it("includes coming-soon providers when availability=all", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: [
                        {
                            model_id: "test/model-soon",
                            name: "Soon Model",
                            release_date: null,
                            deprecation_date: null,
                            retirement_date: null,
                            status: "active",
                            organisation_id: "openai",
                            input_types: ["text"],
                            output_types: ["text"],
                            organisation: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_soon",
                            provider_id: "openai",
                            api_model_id: "test/model-soon",
                            model_id: "test/model-soon",
                            provider_model_slug: "gpt-soon",
                            is_active_gateway: false,
                            routing_status: "active",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: [
                        {
                            provider_api_model_id: "pam_soon",
                            capability_id: "responses",
                            status: "internal_testing",
                            params: { temperature: true },
                            effective_from: "2999-01-01T00:00:00Z",
                            effective_to: null,
                        },
                    ],
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [
                {
                    data: [
                        {
                            api_provider_id: "openai",
                            api_provider_name: "OpenAI",
                            link: null,
                            country_code: null,
                            status: "beta",
                            routing_status: "active",
                        },
                    ],
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ availability: "all" });

        expect(models).toHaveLength(1);
        expect(models[0]?.availability.status).toBe("coming_soon");
        expect(models[0]?.providers[0]).toMatchObject({
            api_provider_id: "openai",
            availability_status: "coming_soon",
            availability_reason: "scheduled",
            provider_status: "beta",
            capability_status: "internal_testing",
        });
    });

    it("keeps future-dated mappings staged as coming_soon until activation", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const futureEffectiveFrom = "2999-06-01T00:00:00Z";
        const modelRows = [
            {
                model_id: "test/model-scheduled",
                name: "Scheduled Model",
                release_date: null,
                deprecation_date: null,
                retirement_date: null,
                status: "active",
                organisation_id: "openai",
                input_types: ["text"],
                output_types: ["text"],
                organisation: null,
            },
        ];
        const providerModelRows = [
            {
                provider_api_model_id: "pam_scheduled",
                provider_id: "openai",
                api_model_id: "test/model-scheduled",
                model_id: "test/model-scheduled",
                provider_model_slug: "gpt-scheduled",
                is_active_gateway: false,
                routing_status: "active",
                input_modalities: ["text"],
                output_modalities: ["text"],
                effective_from: futureEffectiveFrom,
                effective_to: null,
            },
        ];
        const capabilityRows = [
            {
                provider_api_model_id: "pam_scheduled",
                capability_id: "responses",
                status: "internal_testing",
                params: { temperature: true, top_p: true },
                effective_from: futureEffectiveFrom,
                effective_to: null,
            },
        ];
        const providerRows = [
            {
                api_provider_id: "openai",
                api_provider_name: "OpenAI",
                link: null,
                country_code: null,
                status: "active",
                routing_status: "active",
            },
        ];
        const responses: Record<string, QueryResult[]> = {
            data_models: [
                {
                    data: modelRows,
                    error: null,
                },
                {
                    data: modelRows,
                    error: null,
                },
            ],
            data_api_provider_models: [
                {
                    data: providerModelRows,
                    error: null,
                },
                {
                    data: providerModelRows,
                    error: null,
                },
            ],
            data_api_provider_model_capabilities: [
                {
                    data: capabilityRows,
                    error: null,
                },
                {
                    data: capabilityRows,
                    error: null,
                },
            ],
            data_api_model_aliases: [{ data: [], error: null }, { data: [], error: null }],
            data_api_providers: [
                {
                    data: providerRows,
                    error: null,
                },
                {
                    data: providerRows,
                    error: null,
                },
            ],
            data_api_pricing_rules: [{ data: [], error: null }, { data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const activeOnlyModels = await fetchCatalogue({});
        expect(activeOnlyModels).toHaveLength(0);

        const allModels = await fetchCatalogue({ availability: "all" });

        expect(allModels).toHaveLength(1);
        expect(allModels[0]).toMatchObject({
            model_id: "test/model-scheduled",
            availability: {
                status: "coming_soon",
                provider_count: 1,
                active_provider_count: 0,
                inactive_provider_count: 0,
            },
            supported_params: ["temperature", "top_p"],
        });
        expect(allModels[0]?.providers[0]).toMatchObject({
            api_provider_id: "openai",
            availability_status: "coming_soon",
            availability_reason: "scheduled",
            capability_status: "internal_testing",
            effective_from: futureEffectiveFrom,
        });
    });

    it("surfaces active batch capability mappings with supported parameter metadata", async () => {
        const state: QueryState = { emptyCapabilityInCalled: false };
        const responses: Record<string, QueryResult[]> = {
            data_models: [{
                data: [{
                    model_id: "test/model-batch",
                    name: "Batch Model",
                    release_date: null,
                    deprecation_date: null,
                    retirement_date: null,
                    status: "active",
                    organisation_id: null,
                    input_types: ["text"],
                    output_types: ["text"],
                    organisation: null,
                }],
                error: null,
            }],
            data_api_provider_models: [{
                data: [{
                    provider_api_model_id: "pam_batch",
                    provider_id: "openai",
                    api_model_id: "test/model-batch",
                    model_id: "test/model-batch",
                    provider_model_slug: "batch-model",
                    is_active_gateway: true,
                    routing_status: "active",
                    input_modalities: ["text"],
                    output_modalities: ["text"],
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_provider_model_capabilities: [{
                data: [{
                    provider_api_model_id: "pam_batch",
                    capability_id: "batch",
                    status: "active",
                    params: {
                        endpoint: {
                            type: "enum",
                            values: ["/v1/responses", "/v1/chat/completions"],
                            default: "/v1/responses",
                        },
                        completion_window: {
                            type: "enum",
                            values: ["24h"],
                            default: "24h",
                        },
                    },
                    effective_from: null,
                    effective_to: null,
                }],
                error: null,
            }],
            data_api_model_aliases: [{ data: [], error: null }],
            data_api_providers: [{
                data: [{
                    api_provider_id: "openai",
                    api_provider_name: "OpenAI",
                    link: null,
                    country_code: null,
                    status: "active",
                    routing_status: "active",
                }],
                error: null,
            }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ endpoints: ["batch"] });

        expect(models).toHaveLength(1);
        expect(models[0]?.providers[0]).toMatchObject({
            capability_status: "active",
            availability_status: "active",
            availability_reason: "active",
            params: ["completion_window", "endpoint"],
            params_detail: {
                endpoint: {
                    supported: true,
                    type: "enum",
                    values: ["/v1/responses", "/v1/chat/completions"],
                    default: "/v1/responses",
                },
                completion_window: {
                    supported: true,
                    type: "enum",
                    values: ["24h"],
                    default: "24h",
                },
            },
        });
        expect(models[0]?.supported_params).toEqual(["completion_window", "endpoint"]);
        expect(models[0]?.supported_params_detail).toMatchObject({
            endpoint: {
                supported: true,
                type: "enum",
                values: ["/v1/chat/completions", "/v1/responses"],
                default: "/v1/responses",
                providers: ["openai"],
            },
            completion_window: {
                supported: true,
                type: "enum",
                values: ["24h"],
                default: "24h",
                providers: ["openai"],
            },
        });
        expect(models[0]?.availability.status).toBe("active");
    });

    it("matches route-style batch endpoint filters to catalogue batch capabilities", async () => {
        const buildResponses = (): { state: QueryState; responses: Record<string, QueryResult[]> } => ({
            state: { emptyCapabilityInCalled: false },
            responses: {
                data_models: [{
                    data: [{
                        model_id: "test/model-batch-route",
                        name: "Batch Route Model",
                        release_date: null,
                        deprecation_date: null,
                        retirement_date: null,
                        status: "active",
                        organisation_id: null,
                        input_types: ["text"],
                        output_types: ["text"],
                        organisation: null,
                    }],
                    error: null,
                }],
                data_api_provider_models: [{
                    data: [{
                        provider_api_model_id: "pam_batch_route",
                        provider_id: "openai",
                        api_model_id: "test/model-batch-route",
                        model_id: "test/model-batch-route",
                        provider_model_slug: "batch-route-model",
                        is_active_gateway: true,
                        routing_status: "active",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        effective_from: null,
                        effective_to: null,
                    }],
                    error: null,
                }],
                data_api_provider_model_capabilities: [{
                    data: [{
                        provider_api_model_id: "pam_batch_route",
                        capability_id: "batch",
                        status: "active",
                        params: {
                            endpoint: {
                                type: "enum",
                                values: ["/v1/responses", "/v1/chat/completions"],
                                default: "/v1/responses",
                            },
                            completion_window: {
                                type: "enum",
                                values: ["24h"],
                                default: "24h",
                            },
                        },
                        effective_from: null,
                        effective_to: null,
                    }],
                    error: null,
                }],
                data_api_model_aliases: [{ data: [], error: null }],
                data_api_providers: [{
                    data: [{
                        api_provider_id: "openai",
                        api_provider_name: "OpenAI",
                        link: null,
                        country_code: null,
                        status: "active",
                        routing_status: "active",
                    }],
                    error: null,
                }],
                data_api_pricing_rules: [{ data: [], error: null }],
            },
        });

        const { fetchCatalogue } = await import("./models.catalogue");

        for (const endpoint of ["/v1/batches", "batches"]) {
            const { state, responses } = buildResponses();
            getSupabaseAdminMock.mockReturnValueOnce(buildSupabaseMock(responses, state));
            const models = await fetchCatalogue({ endpoints: [endpoint] });
            expect(models).toHaveLength(1);
            expect(models[0]).toMatchObject({
                model_id: "test/model-batch-route",
                endpoints: ["batch"],
                supported_params: ["completion_window", "endpoint"],
                supported_params_detail: {
                    endpoint: {
                        supported: true,
                        type: "enum",
                        values: ["/v1/chat/completions", "/v1/responses"],
                        default: "/v1/responses",
                        providers: ["openai"],
                    },
                    completion_window: {
                        supported: true,
                        type: "enum",
                        values: ["24h"],
                        default: "24h",
                        providers: ["openai"],
                    },
                },
            });
        }
    });
});
