// lib/gateway/execute/utils.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Helpers for timing and attempt metadata.
import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "./index";

export function captureTimingSnapshot(ctx: PipelineContext, timing: PipelineTiming) {
    ctx.timing = timing.timer.snapshot();
}

export function getBaseModel(model: string): string {
    return stripPrioritySuffix(model);
}

export function stripPrioritySuffix(model: string): string {
    if (!model) return model;
    if (model.toLowerCase().endsWith(":fast")) return model.slice(0, -5);
    if (model.toLowerCase().endsWith(":quick")) return model.slice(0, -6);
    if (model.toLowerCase().endsWith(":nitro")) return model.slice(0, -6);
    return model;
}

export function calculateMaxTries(candidatesLength: number): number {
    return Math.min(5, candidatesLength);
}










