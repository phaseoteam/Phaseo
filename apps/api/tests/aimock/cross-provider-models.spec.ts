import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveProviderExecutor } from "@executors/index";
import {
    buildCrossProviderConformanceMatrix,
    type ProviderCatalog,
    type CrossProviderDeployment,
} from "../../../../packages/testing/provider-mock/src/index";
import {
    executeTextProtocol,
    expectCompleted,
    extractProtocolText,
    getAimock,
    resetAimockState,
    startAimock,
    stopAimock,
} from "./harness";

const catalogsRoot = path.resolve(import.meta.dirname, "../../../../packages/data/catalog/src/data/api_providers");
const catalogs: ProviderCatalog[] = readdirSync(catalogsRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const modelsPath = path.join(catalogsRoot, entry.name, "models.json");
    try {
        return [{ providerId: entry.name, models: JSON.parse(readFileSync(modelsPath, "utf8")) }];
    } catch (error: any) {
        if (error?.code === "ENOENT") return [];
        throw error;
    }
});

const multiProviderMatrix = buildCrossProviderConformanceMatrix(catalogs, {
    capability: "text.generate",
});
const matrix = buildCrossProviderConformanceMatrix(catalogs, {
    capability: "text.generate",
    minProviders: 1,
});
const executable = matrix.deployments.filter((deployment) =>
    Boolean(resolveProviderExecutor(deployment.providerId, "text.generate")));
const toolCases = executable.filter((deployment) => deployment.parameters.includes("tools"));
const structuredCases = executable.filter((deployment) =>
    deployment.parameters.includes("response_format") || deployment.parameters.includes("structured_outputs"));
const samplingCases = executable.filter((deployment) =>
    deployment.parameters.includes("temperature") || deployment.parameters.includes("max_tokens"));

function caseName(deployment: CrossProviderDeployment): string {
    return `${deployment.internalModelId} via ${deployment.providerId} (${deployment.providerModelSlug})`;
}

async function execute(deployment: CrossProviderDeployment, marker: string, additions: Record<string, unknown> = {}) {
    const testId = `cross-provider-${createHash("sha256").update(`${deployment.id}:${marker}`).digest("hex").slice(0, 24)}`;
    return executeTextProtocol({
        providerId: deployment.providerId,
        providerModelSlug: deployment.providerModelSlug,
        protocol: "openai.chat.completions",
        testId,
        body: {
            model: deployment.apiModelId,
            messages: [{ role: "user", content: marker }],
            ...additions,
        },
    });
}

function expectSuccessfulText(result: Awaited<ReturnType<typeof execute>>, expected: string) {
    if (result.result.kind !== "completed" || !result.result.ir) {
        throw new Error(JSON.stringify({ status: result.result.upstream.status, rawResponse: result.result.kind === "completed" ? result.result.rawResponse : null, request: getAimock().getLastRequest() }, null, 2));
    }
    const completed = expectCompleted(result.result);
    expect(completed.upstream.status).toBe(200);
    expect(extractProtocolText("openai.chat.completions", result.encoded)).toContain(expected);
    expect(getAimock().getLastRequest()?.headers["x-test-id"]).toBe(result.testId);
}

describe("cross-provider model deployment matrix", () => {
    beforeAll(startAimock);
    afterAll(stopAimock);
    beforeEach(resetAimockState);

    it("covers every active text deployment with a resolvable executor", () => {
        const missing = matrix.deployments.filter((deployment) =>
            !resolveProviderExecutor(deployment.providerId, "text.generate"));
        expect({
            models: matrix.modelCount,
            providers: matrix.providerCount,
            deployments: matrix.deployments.length,
            multiProviderModels: multiProviderMatrix.modelCount,
            multiProviderDeployments: multiProviderMatrix.deployments.length,
            missing: missing.map(caseName),
        }).toMatchObject({
            models: 355,
            providers: 49,
            deployments: 796,
            multiProviderModels: 127,
            multiProviderDeployments: 565,
            missing: [],
        });
    });

    it.each(executable.map((deployment) => [caseName(deployment), deployment] as const))(
        "generates text for %s",
        async (_name, deployment) => {
            const result = await execute(deployment, "[aimock-chat] hello");
            expectSuccessfulText(result, "Hello from AIMock");
        },
    );

    it.each(toolCases.map((deployment) => [caseName(deployment), deployment] as const))(
        "round-trips tools for %s",
        async (_name, deployment) => {
            const result = await execute(deployment, "[aimock-tool] weather", {
                tools: [{
                    type: "function",
                    function: {
                        name: "get_weather",
                        description: "Get weather by city",
                        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
                        strict: true,
                    },
                }],
                tool_choice: "required",
            });
            const completed = expectCompleted(result.result);
            expect(completed.upstream.status).toBe(200);
            expect(result.encoded?.choices?.[0]?.message?.tool_calls?.[0]?.function).toMatchObject({ name: "get_weather" });
            expect(getAimock().getLastRequest()?.headers["x-test-id"]).toBe(result.testId);
        },
    );

    it.each(structuredCases.map((deployment) => [caseName(deployment), deployment] as const))(
        "round-trips structured output for %s",
        async (_name, deployment) => {
            const result = await execute(deployment, "[aimock-structured] person", {
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "person",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: { name: { type: "string" }, city: { type: "string" } },
                            required: ["name", "city"],
                            additionalProperties: false,
                        },
                    },
                },
            });
            expectSuccessfulText(result, "Ava");
            expect(JSON.parse(extractProtocolText("openai.chat.completions", result.encoded))).toMatchObject({ name: "Ava", city: "London" });
        },
    );

    it.each(samplingCases.map((deployment) => [caseName(deployment), deployment] as const))(
        "accepts declared sampling limits for %s",
        async (_name, deployment) => {
            const additions: Record<string, unknown> = {};
            if (deployment.parameters.includes("temperature")) additions.temperature = 0.2;
            if (deployment.parameters.includes("max_tokens")) additions.max_tokens = 32;
            const result = await execute(deployment, "[aimock-chat] hello", additions);
            expectSuccessfulText(result, "Hello from AIMock");
        },
    );
});
