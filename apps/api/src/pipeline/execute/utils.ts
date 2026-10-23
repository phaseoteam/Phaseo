// lib/gateway/execute/utils.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Helpers for timing and attempt metadata.
import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "./index";
import { readProviderCatalogTier, readRequestedServiceTier, normalizeTextServiceTier } from "@core/serviceTiers";

export function googleFlexMinimumHeadersTimeoutMs(providerId: string, capabilityParams: Record<string, unknown> | undefined, body: unknown): number | undefined {
    const isGoogle = providerId === "google-ai-studio" || providerId === "google-vertex" || providerId === "google-vertex-eu";
    const tier = readProviderCatalogTier(capabilityParams)?.name ?? normalizeTextServiceTier(readRequestedServiceTier(body).value);
    return isGoogle && tier === "flex" ? 600_000 : undefined;
}

/**
 * Gemini 4 Argon thinks before its first streamed chunk, so Google returns no headers until
 * then; Google says to "Set HTTP client timeouts to at least 20 minutes per call"
 * (https://ai.google.dev/gemini-api/docs/generate-content/latest-model). Every other model keeps
 * GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS.
 */
export function longThinkingMinimumHeadersTimeoutMs(providerId: string, model: string | null | undefined): number | undefined {
    const isGoogle = providerId === "google-ai-studio" || providerId === "google-vertex" || providerId === "google-vertex-eu";
    const slug = String(model ?? "").trim().toLowerCase().split("/").pop() ?? "";
    return isGoogle && /^gemini-4-argon(?:$|[-_@:])/.test(slug) ? 1_200_000 : undefined;
}

export function captureTimingSnapshot(ctx: PipelineContext, timing: PipelineTiming) {
    ctx.timing = timing.timer.snapshot();
}

export function getBaseModel(model: string): string {
    return stripPrioritySuffix(model);
}

export function stripPrioritySuffix(model: string): string {
    if (!model) return model;
    if (model.toLowerCase().endsWith(":fast")) return model.slice(0, -5);
    if (model.toLowerCase().endsWith(":cheap")) return model.slice(0, -6);
    if (model.toLowerCase().endsWith(":nitro")) return model.slice(0, -6);
    return model;
}

export function calculateMaxTries(candidatesLength: number, allowFallbacks = true): number {
    if (!allowFallbacks) {
        return candidatesLength > 0 ? 1 : 0;
    }
    return candidatesLength;
}










