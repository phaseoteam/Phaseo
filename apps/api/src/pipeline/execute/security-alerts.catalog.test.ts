import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities } from "./modalities";
import { isWithinEffectiveWindow, normalizeCapabilityStatus } from "../before/context.shared";
import type { ProviderCandidate } from "../before/types";
import type { IRChatRequest } from "@core/ir";

// Route rows copied from the deepinfra and weights-and-biases catalogue entries.
const deepInfraR1Route = {
    provider_api_model_id: "deepinfra:deepseek/deepseek-r1-0528",
    api_model_id: "deepseek/deepseek-r1-0528",
    input_modalities: "text",
    output_modalities: "text",
};

const deprecatedWandbRoute = (id: string, effectiveFrom: string) => ({
    provider_api_model_id: `weights-and-biases:${id}`,
    provider_status: "deprecated",
    routable: true,
    effective_from: effectiveFrom,
    effective_to: "2026-09-28T00:00:00Z",
    capabilities: [{ capability_id: "text.generate", status: "active" }],
});

const deprecatedWandbRoutes = [
    deprecatedWandbRoute("deepseek/deepseek-v4-flash", "2026-05-11T00:00:00"),
    deprecatedWandbRoute("deepseek/deepseek-v4-pro", "2026-05-15T00:00:00"),
    deprecatedWandbRoute("ibm/granite-4.1-8b", "2026-04-29T00:00:00"),
    deprecatedWandbRoute("meta/llama-3.1-70b", "2026-03-25T00:00:00"),
    deprecatedWandbRoute("qwen/qwen3-30b-a3b-2507", "2026-03-25T00:00:00"),
    deprecatedWandbRoute("qwen/qwen3.5-35b-a3b", "2026-05-11T00:00:00"),
    deprecatedWandbRoute("qwen/qwen3.6-27b", "2026-05-22T00:00:00"),
    deprecatedWandbRoute("qwen/qwen3-14b", "2026-08-21T00:00:00Z"),
    deprecatedWandbRoute("jetbrains/mellum2-12b-a2.5b", "2026-08-21T00:00:00Z"),
];

describe("September 5 routing alerts", () => {
    it("rejects unsupported vision input while preserving text requests", () => {
        const route = deepInfraR1Route;
        const candidate = { providerId: "deepinfra", inputModalities: route.input_modalities.split(","),
            outputModalities: route.output_modalities.split(",") } as ProviderCandidate;
        const text: IRChatRequest = { model: route.api_model_id, stream: false,
            messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] };
        expect(filterCandidatesByModalities([candidate], text)).toHaveLength(1);
        const image: IRChatRequest = { ...text, messages: [{ role: "user", content: [
            { type: "image", source: "url", data: "https://example.com/image.png" },
        ] }] };
        expect(filterCandidatesByModalities([candidate], image)).toHaveLength(0);
    });

    it("keeps all nine W&B capabilities operational only inside the route retirement window", () => {
        const routes = deprecatedWandbRoutes;
        expect(routes).toHaveLength(9);
        for (const route of routes) {
            expect(route.routable).toBe(true);
            expect(normalizeCapabilityStatus(route.capabilities.find((cap) => cap.capability_id === "text.generate")!.status)).toBe("active");
            expect(isWithinEffectiveWindow(route.effective_from, route.effective_to, Date.parse("2026-09-05T12:00:00Z"))).toBe(true);
            expect(isWithinEffectiveWindow(route.effective_from, route.effective_to, Date.parse("2026-09-28T00:00:00Z"))).toBe(false);
        }
    });
});
