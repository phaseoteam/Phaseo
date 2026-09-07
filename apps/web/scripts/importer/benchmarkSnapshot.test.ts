jest.mock("./paths", () => ({ DATA_ROOT: "/fixture", DIR_ALIASES: "/aliases" }));
jest.mock("node:fs", () => ({
    ...jest.requireActual("node:fs"),
    existsSync: () => false,
    readdirSync: (path: string) => path.endsWith("models") ? [{ name: "model.json", isDirectory: () => false }] : [],
    readFileSync: () => JSON.stringify({
        model_id: "openai/example",
        benchmarks: [{ benchmark_id: "aa-intelligence-index-v4", score: 42, updated_at: "2026-09-07T22:00:00.000Z" }],
    }),
}));

import { preflightV2Benchmarks, sourceJsonMaps } from "./v2";

test("catalog snapshot timestamps survive JSON loading and database row conversion", () => {
    const source = sourceJsonMaps();
    expect(source.benchmarkResults[0].updated_at).toBe("2026-09-07T22:00:00.000Z");
    const result = preflightV2Benchmarks(source.benchmarkResults, new Set(["aa-intelligence-index-v4"]), new Set(["openai/example"]), String);
    expect(result).toMatchObject({ rows: [{ updated_at: "2026-09-07T22:00:00.000Z" }] });
});
