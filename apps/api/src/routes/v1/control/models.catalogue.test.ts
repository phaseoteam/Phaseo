import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: getSupabaseAdminMock,
}));

type QueryResult = {
    data: any;
    error: { message?: string } | null;
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
            data_api_provider_models: [{ data: [], error: null }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({});

        expect(state.emptyCapabilityInCalled).toBe(false);
        expect(models).toHaveLength(1);
        expect(models[0]?.model_id).toBe("test/model-1");
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
            data_api_provider_models: [{ data: [], error: null }],
            data_api_pricing_rules: [{ data: [], error: null }],
        };

        getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(responses, state));
        const { fetchCatalogue } = await import("./models.catalogue");

        const models = await fetchCatalogue({ statuses: ["active"] });

        expect(models).toHaveLength(1);
        expect(models[0]?.model_id).toBe("test/model-active");
    });
});
