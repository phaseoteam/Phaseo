import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities } from "./modalities";
import { isWithinEffectiveWindow, normalizeCapabilityStatus } from "../before/context.shared";
import type { ProviderCandidate } from "../before/types";
import type { IRChatRequest } from "@core/ir";

const catalog = (provider: string) => JSON.parse(readFileSync(new URL(
    `../../../../../packages/data/catalog/src/data/api_providers/${provider}/models.json`, import.meta.url,
), "utf8"));

describe("September 5 routing alerts", () => {
    it("rejects CrofAI vision input while preserving text requests", () => {
        const route = catalog("crofai").find((row: any) => row.provider_api_model_id === "crofai:deepseek-v4-flash-vision-exp");
        const candidate = { providerId: "crofai", inputModalities: route.input_modalities.split(","),
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
        const routes = catalog("weights-and-biases").filter((row: any) => row.provider_status === "deprecated");
        expect(routes).toHaveLength(9);
        for (const route of routes) {
            expect(route.routable).toBe(true);
            expect(normalizeCapabilityStatus(route.capabilities.find((cap: any) => cap.capability_id === "text.generate").status)).toBe("active");
            expect(isWithinEffectiveWindow(route.effective_from, route.effective_to, Date.parse("2026-09-05T12:00:00Z"))).toBe(true);
            expect(isWithinEffectiveWindow(route.effective_from, route.effective_to, Date.parse("2026-09-28T00:00:00Z"))).toBe(false);
        }
    });
});
