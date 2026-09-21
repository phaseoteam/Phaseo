import type { LifecycleRow, LifecycleRows } from "./rows";
import type { claimAsyncWebhookDelivery, recordAsyncWebhookDeliveryResult } from "../async-operations";
type Claim = Parameters<typeof claimAsyncWebhookDelivery>[0];
type Result = Parameters<typeof recordAsyncWebhookDeliveryResult>[0];
const table = "gateway_async_webhook_deliveries";

// Called inside the workspace object's synchronous transaction. The operation's
// retry metadata and delivery lease always commit together.
export class WebhookState {
    constructor(private readonly rows: LifecycleRows, private readonly workspaceId: () => string) {}
    claim(action: "claim" | "complete" | "release", args: Claim, now = Date.now()): boolean {
        if (args.workspaceId !== this.workspaceId() || !args.claimToken) throw new Error("invalid_webhook_delivery_claim");
        const identity = { kind: args.kind, internal_id: args.internalId, delivery_key: args.deliveryKey };
        const current = this.rows.get(table, identity);
        const row = current?.row;
        if (action !== "claim") {
            if (!row || row.status !== "claimed" || row.claim_token !== args.claimToken) return false;
            this.rows.patch(table, identity, { status: action === "complete" ? "delivered" : "pending",
                claim_token: null, claimed_at: null, ...(action === "complete" ? { delivered_at: new Date(now).toISOString() } : {}) });
            return true;
        }
        if (row?.status === "delivered" || row?.status === "failed") return false;
        if (row?.status === "pending" && Date.parse(String(row.next_attempt_at)) > now) return false;
        if (row?.status === "claimed" && row.claim_token !== args.claimToken &&
            Date.parse(String(row.claimed_at)) > now - Math.max(30, args.staleAfterSeconds ?? 300) * 1000) return false;
        this.rows.put(table, { ...row, ...identity, workspace_id: args.workspaceId, status: "claimed", claim_token: args.claimToken,
            claimed_at: new Date(now).toISOString(), event_type: row?.event_type ?? args.eventType ?? args.deliveryKey.split(":")[0],
            phase: row?.phase ?? args.phase ?? args.deliveryKey.split(":")[0].split(".")[1],
            progress: row?.progress ?? args.progress ?? null, previous_status: row?.previous_status ?? args.previousStatus ?? null,
            current_status: row?.current_status ?? args.currentStatus ?? null }, current?.revision ?? 0);
        return true;
    }
    result(args: Result): void {
        if (args.workspaceId !== this.workspaceId()) throw new Error("lifecycle_workspace_mismatch");
        const identity = { kind: args.kind, internal_id: args.internalId };
        const op = this.rows.get("gateway_async_operations", identity);
        if (!op) return;
        const deliveryIdentity = { ...identity, delivery_key: args.deliveryKey };
        const delivery = this.rows.get(table, deliveryIdentity);
        if (args.claimToken && (delivery?.row.status !== "claimed" || delivery?.row.claim_token !== args.claimToken)) throw new Error("stale_webhook_delivery_claim");
        const meta = (op.row.meta ?? {}) as LifecycleRow;
        const queue = { ...(meta.webhookRetryQueue as LifecycleRow ?? {}) };
        if (args.retryState) queue[args.deliveryKey] = args.retryState; else delete queue[args.deliveryKey];
        const deliveries = { ...(meta.webhookDeliveries as LifecycleRow ?? {}) };
        if (args.deliveredAt) deliveries[args.deliveryKey] = args.deliveredAt;
        const attempts = [...(Array.isArray(meta.webhookAttempts) ? meta.webhookAttempts : []), args.attempt].slice(-50);
        const next = Object.values(queue).map(r => (r as LifecycleRow)?.nextRetryAt).filter((v): v is string => typeof v === "string").sort()[0] ?? null;
        const telemetry = { ...args.telemetryPatch };
        for (const key of ["webhookAttempts", "webhookRetryQueue", "webhookDeliveries", "nextWebhookRetryAt", "lastWebhookDispatchedAt", "lastWebhookProgress", "lastWebhookProgressAt"]) delete telemetry[key];
        this.rows.patch("gateway_async_operations", identity, { meta: { ...meta, ...telemetry, webhookAttempts: attempts,
            webhookRetryQueue: queue, webhookDeliveries: deliveries, nextWebhookRetryAt: next, lastWebhookDispatchedAt: new Date().toISOString(),
            ...(args.progress != null ? { lastWebhookProgress: args.progress, lastWebhookProgressAt: new Date().toISOString() } : {}) } });
        if (delivery) this.rows.patch(table, deliveryIdentity, { status: args.deliveredAt ? "delivered" : !args.nextRetryAt ? "failed" : delivery.row.status,
            ...(!args.nextRetryAt ? { claim_token: null, claimed_at: null } : {}), delivered_at: args.deliveredAt ?? delivery.row.delivered_at ?? null,
            next_attempt_at: args.nextRetryAt ?? null, last_error: args.attempt.error_message ?? null });
    }
}
