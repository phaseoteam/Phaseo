import type { PipelineContext } from "@/pipeline/before/types";
import { getBindingsIfConfigured } from "@/runtime/env";
import { countOperation } from "@/runtime/request-operations";

type Reservation = { owner: string; id: string; billable: boolean; outcome?: boolean; pending?: Promise<void> };
const reservations = new WeakMap<PipelineContext, Reservation>();
export function registerIncludedQuota(ctx: PipelineContext, id: string): void {
    reservations.set(ctx, { owner: ctx.workspaceOwnerUserId!, id, billable: false });
}
export function hasIncludedQuota(ctx: PipelineContext): boolean { return reservations.has(ctx); }
export function markIncludedQuota(ctx: PipelineContext, billable: boolean): void {
    const reservation = reservations.get(ctx);
    if (reservation && reservation.outcome === undefined) reservation.billable = billable;
}
export async function finishIncludedQuota(ctx: PipelineContext, success: boolean): Promise<void> {
    const reservation = reservations.get(ctx);
    if (!reservation) return;
    // First terminal decision wins, including disconnect before usage recovery.
    reservation.outcome ??= success && reservation.billable;
    if (!reservation.pending) {
        reservation.pending = (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const binding = getBindingsIfConfigured()?.FREE_MODEL_QUOTA;
                    if (!binding) throw new Error("free_quota_coordinator_unavailable");
                    countOperation("quotaRpc");
                    const reply = await binding.getByName(`owner:${reservation.owner}`).finishIncluded(reservation.id, reservation.outcome!);
                    if (reply?.settled !== true) throw new Error("free_quota_completion_unconfirmed");
                    return;
                } catch (error) { if (attempt === 2) throw error; }
            }
        })().catch(error => { reservation.pending = undefined; throw error; });
    }
    await reservation.pending;
}
