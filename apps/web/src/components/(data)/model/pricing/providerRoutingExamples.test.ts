import { buildProviderRoutingExample, ROUTING_LANGUAGES } from "./providerRoutingExamples";

const route = { providerId: "openai-eu", modelId: "openai/example", serviceTier: "standard", endpoint: "responses" };

function curlPayload(code: string) {
    return JSON.parse(code.slice(code.indexOf("  -d '") + 6, -1));
}

describe("provider routing examples", () => {
    it("passes the full slug directly as model without a separate provider constraint", () => {
        expect(JSON.parse(buildProviderRoutingExample({ ...route, language: "json" }))).toEqual({ model: "openai-eu:openai/example" });
    });

    it.each(["priority", "flex"])("preserves the selected %s tier", serviceTier => {
        expect(JSON.parse(buildProviderRoutingExample({ ...route, serviceTier, language: "json" }))).toEqual({
            model: "openai-eu:openai/example", service_tier: serviceTier,
        });
    });

    it.each(["free", "on-demand", "llm-plus"])("does not send the pricing label %s as a service tier", serviceTier => {
        expect(curlPayload(buildProviderRoutingExample({ ...route, serviceTier, language: "curl" }))).not.toHaveProperty("service_tier");
    });

    it("uses the current model and endpoint for cURL", () => {
        const code = buildProviderRoutingExample({ ...route, language: "curl" });
        expect(code).toContain("https://api.phaseo.app/v1/responses");
        expect(curlPayload(code)).toMatchObject({ model: `${route.providerId}:${route.modelId}`, input: expect.any(String) });
        expect(curlPayload(code)).not.toHaveProperty("provider");
    });

    it.each([
        ["text.generate", "/chat/completions", "messages"],
        ["text.embed", "/embeddings", "input"],
        ["image.generate", "/images/generations", "prompt"],
    ])("maps the catalogue capability %s to a public request endpoint", (endpoint, path, inputField) => {
        const code = buildProviderRoutingExample({ ...route, endpoint, language: "curl" });
        expect(code).toContain(`https://api.phaseo.app/v1${path}`);
        expect(curlPayload(code)).toHaveProperty(inputField);
    });

    it("submits batch examples through the Batch API, not a synchronous batch service tier", () => {
        const code = buildProviderRoutingExample({ ...route, serviceTier: "batch", language: "curl" });
        expect(code).toContain("https://api.phaseo.app/v1/batches");
        expect(curlPayload(code)).toMatchObject({ provider: { only: [route.providerId] }, requests: [{ body: { model: route.modelId } }] });
        expect(code).not.toContain("service_tier");
        expect(JSON.parse(buildProviderRoutingExample({ ...route, serviceTier: "batch", language: "json" }))).toEqual({ provider: { only: [route.providerId] } });
    });

    it.each(ROUTING_LANGUAGES)("includes the exact provider and tier in $label", ({ id }) => {
        const code = buildProviderRoutingExample({ ...route, serviceTier: "priority", language: id });
        expect(code).toContain("openai-eu:openai/example");
        expect(code).not.toContain("only");
        expect(code).toContain("priority");
    });

    it("escapes quotes in copied JSON and shell data", () => {
        const providerId = 'provider"with\'quotes';
        expect(JSON.parse(buildProviderRoutingExample({ ...route, providerId, language: "json" })).model).toBe(`${providerId}:${route.modelId}`);
        expect(buildProviderRoutingExample({ ...route, providerId, language: "curl" })).toContain("'\\''");
    });
});
