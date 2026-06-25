export {};

function percentile(values: number[], p: number): number {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
}

const createClient = jest.fn();
const getWorkspaceIdFromCookie = jest.fn();
const requireWorkspaceMembership = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
        createClient,
}));

jest.mock("@/utils/workspaceCookie", () => ({
        getWorkspaceIdFromCookie,
}));

jest.mock("@/utils/serverActionAuth", () => ({
        requireAuthenticatedUser: jest.fn(),
        requireWorkspaceMembership,
}));

type QueryResult = {
        data: any[];
        error: any;
        count: number;
};

function buildAwaitableQuery(result: QueryResult) {
        const queryPromise = Promise.resolve(result);
        const query: any = {
                eq: jest.fn(() => query),
                gte: jest.fn(() => query),
                lte: jest.fn(() => query),
                not: jest.fn(() => query),
                order: jest.fn(() => query),
                range: jest.fn(() => query),
                then: queryPromise.then.bind(queryPromise),
                catch: queryPromise.catch.bind(queryPromise),
                finally: queryPromise.finally.bind(queryPromise),
        };
        return query;
}

const rows = Array.from({ length: 25 }, (_, index) => ({
        request_id: `req_${index}`,
        created_at: `2026-05-05T10:${String(index).padStart(2, "0")}:00.000Z`,
        endpoint: "responses",
        model_id: "openai/gpt-5.4-nano",
        provider: "openai",
        stream: index % 2 === 0,
        session_id: `sess_${index}`,
        app_id: `app_${index}`,
        app: {
                id: `app_${index}`,
                app_key: `app-key-${index}`,
                title: `App ${index}`,
                image_url: `https://example.com/app-${index}.png`,
        },
        usage: {
                input_tokens: 100 + index,
                output_tokens: 50 + index,
        },
        cost_nanos: 1_000 + index,
        generation_ms: 200 + index,
        latency_ms: 100 + index,
        finish_reason: "stop",
        success: true,
        status_code: 200,
        error_code: null,
        error_message: null,
        key_id: `key_${index}`,
        throughput: 2.5,
}));

const supabase = {
        auth: {
                getUser: jest.fn(async () => ({
                        data: { user: { id: "user_perf_logs" } },
                        error: null,
                })),
        },
        from: jest.fn(() => ({
                select: jest.fn(() =>
                        buildAwaitableQuery({
                                data: rows,
                                error: null,
                                count: rows.length,
                        }),
                ),
        })),
};

let fetchPaginatedRequests: typeof import("./server-actions").fetchPaginatedRequests;

describe("fetchPaginatedRequests performance", () => {
        beforeAll(async () => {
                ({ fetchPaginatedRequests } = await import("./server-actions"));
        });

        beforeEach(() => {
                createClient.mockReset();
                createClient.mockResolvedValue(supabase as any);
                getWorkspaceIdFromCookie.mockReset();
                getWorkspaceIdFromCookie.mockResolvedValue("team_perf_logs");
                requireWorkspaceMembership.mockReset();
                requireWorkspaceMembership.mockResolvedValue(undefined);
                supabase.auth.getUser.mockClear();
                supabase.from.mockClear();
        });

        it("keeps paginated usage-log fetch shaping under 10ms p95 for the mocked hot path", async () => {
                const params = {
                        timeRange: {
                                from: "2026-05-01T00:00:00.000Z",
                                to: "2026-05-05T23:59:59.999Z",
                        },
                        page: 1,
                        sortField: "created_at",
                        sortDirection: "desc" as const,
                };

                const warm = await fetchPaginatedRequests(params);
                expect(warm.data).toHaveLength(25);
                expect(warm.data[0]?.app_title).toBe("App 0");

                createClient.mockClear();
                getWorkspaceIdFromCookie.mockClear();
                requireWorkspaceMembership.mockClear();
                supabase.auth.getUser.mockClear();
                supabase.from.mockClear();

                const samples: number[] = [];
                const iterations = 200;
                for (let i = 0; i < iterations; i += 1) {
                        const started = performance.now();
                        const result = await fetchPaginatedRequests(params);
                        samples.push(performance.now() - started);
                        expect(result.data).toHaveLength(25);
                        expect(result.total).toBe(25);
                }

                const p50 = percentile(samples, 50);
                const p95 = percentile(samples, 95);
                const p99 = percentile(samples, 99);
                const avg =
                        samples.reduce((sum, value) => sum + value, 0) /
                        samples.length;

                console.log(
                        `[perf][usage-logs] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
                );

                expect(p95).toBeLessThan(10);
                expect(createClient).toHaveBeenCalledTimes(iterations);
                expect(getWorkspaceIdFromCookie).toHaveBeenCalledTimes(iterations);
                expect(requireWorkspaceMembership).toHaveBeenCalledTimes(iterations);
                expect(supabase.auth.getUser).toHaveBeenCalledTimes(iterations);
                expect(supabase.from).toHaveBeenCalledTimes(iterations);
        });
});
