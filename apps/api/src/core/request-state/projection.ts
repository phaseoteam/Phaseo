import type { GatewayBindings } from "@/runtime/env.types";
import type { LedgerEvent } from "./ledger";
import type { RowProjection } from "./rows";

export async function projectLifecycleRow(env: GatewayBindings, event: RowProjection): Promise<void> {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/gateway_request_state_project_row`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ p_event: event }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || await response.json() !== event.revision) throw new Error("request_state_row_projection_failed");
}

// Background only. Uncertain responses retry the identical event; SQL verifies
// sequence and payload before returning an acknowledgment.
export async function projectAccountingEvent(env: GatewayBindings, event: LedgerEvent): Promise<number> {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/gateway_request_state_project`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ p_event: event }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`request_state_projection_http_${response.status}`);
    const sequence: unknown = await response.json();
    if (sequence !== event.sequence) throw new Error("request_state_projection_ack_mismatch");
    return event.sequence;
}
