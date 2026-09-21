import type { RealtimeSessionRow } from "../realtime-sessions";
import { RequestLedger, nanos, type StateStore } from "./ledger";
import { LifecycleRows, type LifecycleRow } from "./rows";
const table = "gateway_realtime_sessions";
const terminal = new Set(["completed", "failed", "cancelled", "expired"]);
export type RealtimeCreation = { row: RealtimeSessionRow; holdNanos: number; maxWorkspaceSessions: number; maxKeySessions: number; maxUserSessions: number; maxCreationsPerMinute: number };

// All methods execute within the caller's synchronous durable transaction.
export class RealtimeState {
    constructor(private readonly rows: LifecycleRows, private readonly ledger: RequestLedger, private readonly store: StateStore) {}
    get(sessionId: string): RealtimeSessionRow {
        const row = this.rows.get(table, { session_id: sessionId });
        if (!row) throw new Error("realtime_session_not_found");
        return row.row as RealtimeSessionRow;
    }
    create(input: RealtimeCreation): RealtimeSessionRow {
        const row = input.row;
        if (row.workspace_id !== this.ledger.wallet().workspaceId || !row.key_id) throw new Error("realtime_session_forbidden");
        if (this.rows.get(table, row)) throw new Error("realtime_session_already_exists");
        const active = this.rows.list(table, { statuses: ["created", "connecting", "connected", "ending", "billing_unresolved"], limit: 1000 }).map(r => r.row);
        if (active.length >= input.maxWorkspaceSessions || active.filter(r => r.key_id === row.key_id).length >= input.maxKeySessions ||
            (row.user_id && active.filter(r => r.user_id === row.user_id).length >= input.maxUserSessions)) throw new Error("realtime_session_limit_reached");
        const recent = this.rows.list(table, { order: "created_at", limit: 1000 }).filter(r => Date.parse(String(r.row.created_at)) >= Date.now() - 60_000);
        if (recent.length >= input.maxCreationsPerMinute) throw new Error("realtime_session_creation_rate_limited");
        const reservation = `${row.reservation_prefix}0001`;
        const held = this.ledger.reserve({ id: reservation, keyId: row.key_id, kind: "hold", amountNanos: input.holdNanos });
        if (!held.applied) throw new Error(`realtime_hold_${held.status}`);
        this.store.put(`realtime-holds:${row.session_id}`, [reservation]);
        return this.rows.put(table, { ...row, status: "created", reserved_nanos: input.holdNanos, reservation_count: 1 }, 0).row as RealtimeSessionRow;
    }
    claim(sessionId: string, secretHash: string): RealtimeSessionRow {
        const row = this.get(sessionId);
        if (!secretHash || row.provider_client_secret_hash !== secretHash || row.status !== "created" ||
            (row.expires_at && Date.parse(row.expires_at) <= Date.now())) throw new Error("realtime_relay_claim_conflict");
        return this.rows.patch(table, row, { status: "connecting", last_event_at: new Date().toISOString() })!.row as RealtimeSessionRow;
    }
    extend(sessionId: string, reservationId: string, targetNanos: number, estimatedNanos: number): RealtimeSessionRow {
        nanos(targetNanos); nanos(estimatedNanos);
        const row = this.get(sessionId);
        if (terminal.has(row.status) || row.status === "billing_unresolved") throw new Error("realtime_session_terminal");
        const additional = Math.max(0, targetNanos - row.reserved_nanos);
        if (additional) {
            const held = this.ledger.reserve({ id: reservationId, keyId: row.key_id!, kind: "hold", amountNanos: additional });
            if (!held.applied) throw new Error(`realtime_hold_${held.status}`);
            this.store.put(`realtime-holds:${sessionId}`, [...(this.store.get<string[]>(`realtime-holds:${sessionId}`) ?? []), reservationId]);
        }
        return this.rows.patch(table, row, { reserved_nanos: Math.max(row.reserved_nanos, targetNanos),
            reservation_count: row.reservation_count + (additional ? 1 : 0), estimated_cost_nanos: Math.max(row.estimated_cost_nanos, estimatedNanos) })!.row as RealtimeSessionRow;
    }
    settle(sessionId: string, costNanos: number, patch: LifecycleRow): { session: RealtimeSessionRow; alreadyApplied: boolean } {
        nanos(costNanos);
        const row = this.get(sessionId);
        if (terminal.has(row.status)) {
            if (row.final_cost_nanos !== costNanos) throw new Error("realtime_settlement_conflict");
            return { session: row, alreadyApplied: true };
        }
        if (!terminal.has(String(patch.status))) throw new Error("invalid_realtime_terminal_status");
        if (costNanos > row.reserved_nanos) throw new Error("realtime_reservation_exceeded");
        const holds = this.store.get<string[]>(`realtime-holds:${sessionId}`) ?? [];
        let remaining = costNanos;
        for (const id of holds) {
            const reservation = this.ledger.reservation(id);
            if (!reservation || reservation.status !== "held") throw new Error("realtime_hold_state_mismatch");
            const amount = Math.min(remaining, reservation.amountNanos);
            if (amount) this.ledger.settle(id, amount); else this.ledger.release(id);
            remaining -= amount;
        }
        if (remaining) throw new Error("realtime_hold_state_mismatch");
        const updated = this.rows.patch(table, row, { ...patch, final_cost_nanos: costNanos, captured_nanos: costNanos,
            released_nanos: row.reserved_nanos - costNanos, ended_at: new Date().toISOString() })!;
        return { session: updated.row as RealtimeSessionRow, alreadyApplied: false };
    }
}
