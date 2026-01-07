// lib/gateway/execute/utils.ts
import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "./index";

export function captureTimingSnapshot(ctx: PipelineContext, timing: PipelineTiming) {
    ctx.timing = timing.timer.snapshot();
}

export function getBaseModel(model: string): string {
    return model;
}

export function calculateMaxTries(candidatesLength: number): number {
    return Math.min(5, candidatesLength);
}
