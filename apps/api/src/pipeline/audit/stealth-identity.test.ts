import { describe, expect, it } from "vitest";
import { protectStealthAuditArgs, sanitizeStealthMetadata } from "./stealth-identity";

describe("stealth audit identity", () => {
    it("leaves ordinary model audits unchanged", () => {
        const input = { model: "openai/gpt-5", provider: "openai" };
        expect(protectStealthAuditArgs(input)).toBe(input);
    });

    it("replaces every top-level execution identity and drops opaque upstream payloads", () => {
        const result = protectStealthAuditArgs({
            model: "stealth/test-model-20260827",
            requestedModel: "stealth/test-model-20260827",
            provider: "openai",
            providerApiModelId: "openai-internal-id",
            providerModelSlug: "oai-stealth-test-model-internal",
            providerRequest: { model: "oai-stealth-test-model-internal" },
            providerResponse: { provider: "openai" },
            serverToolTrace: [{ round: 1, calls: [{ output: { provider: "openai" } }] }],
            extraJson: "opaque provider telemetry",
        });

        expect(result).toMatchObject({
            model: "stealth/test-model-20260827",
            requestedModel: "stealth/test-model-20260827",
            provider: "stealth",
            providerApiModelId: "stealth/test-model-20260827",
            providerModelSlug: "stealth/test-model-20260827",
            providerRequest: null,
            providerResponse: null,
            serverToolTrace: null,
            extraJson: null,
        });
    });

    it("recursively protects attempts, routing diagnostics, URLs, and errors", () => {
        const protectedValue = sanitizeStealthMetadata({
            provider: "openai",
            provider_id: "openai",
            provider_model_id: "openai:internal",
            api_model_id: "internal",
            upstream_url: "https://api.openai.com/v1/responses",
            nested: [{ providerId: "openai", providerModelSlug: "internal" }],
            outcome: "success",
        }, "stealth/test-model-20260827");

        expect(protectedValue).toEqual({
            provider: "stealth",
            provider_id: "stealth",
            provider_model_id: "stealth:stealth/test-model-20260827",
            api_model_id: "stealth/test-model-20260827",
            upstream_url: null,
            nested: [{ providerId: "stealth", providerModelSlug: "stealth/test-model-20260827" }],
            outcome: "success",
        });
    });

    it("uses the requested stealth identity even if the routed model was accidentally internal", () => {
        expect(protectStealthAuditArgs({
            requestedModel: "stealth/public-model",
            model: "openai/internal-model",
            provider: "openai",
        })).toMatchObject({
            requestedModel: "stealth/public-model",
            model: "stealth/public-model",
            provider: "stealth",
        });
    });
});
