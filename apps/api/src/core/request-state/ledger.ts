// Storage-independent accounting transitions. The caller must execute each
// transition in one durable transaction, without external I/O in that transaction.
export interface StateStore {
    get<T>(key: string): T | undefined;
    put<T>(key: string, value: T): void;
}

export type WalletState = {
    workspaceId: string;
    allocationId: string;
    mode: "synthetic" | "escrow";
    balanceNanos: number;
    reservedNanos: number;
    sequence: number;
};
export type Reservation = {
    id: string;
    keyId: string;
    kind: "inference" | "hold";
    amountNanos: number;
    actualNanos: number | null;
    status: "held" | "captured" | "released";
    requestCount: number;
    createdAt: number;
};
export type LedgerEvent = {
    version: 1;
    workspaceId: string;
    allocationId: string;
    sequence: number;
    reservation: Reservation;
    balanceNanos: number;
    reservedNanos: number;
};
export type TransitionResult = {
    applied: boolean;
    alreadyApplied: boolean;
    status: Reservation["status"] | "insufficient_funds" | "not_found" | "reservation_exceeded";
    amountNanos: number;
    beforeBalanceNanos: number;
    afterBalanceNanos: number;
    beforeReservedNanos: number;
    afterReservedNanos: number;
};

export function nanos(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_nanos");
    return value;
}
function identifier(value: string): void {
    if (typeof value !== "string" || value.length < 1 || value.length > 256) throw new Error("invalid_identifier");
}

export class RequestLedger {
    constructor(private readonly store: StateStore) {}

    initialize(input: Omit<WalletState, "reservedNanos" | "sequence">): WalletState {
        identifier(input.workspaceId);
        identifier(input.allocationId);
        nanos(input.balanceNanos);
        const existing = this.store.get<WalletState>("wallet");
        if (existing) {
            if (existing.workspaceId !== input.workspaceId || existing.allocationId !== input.allocationId ||
                existing.mode !== input.mode) throw new Error("wallet_already_initialized");
            // An allocation retry must not replenish already spent credit.
            const opening = this.store.get<number>("opening");
            if (opening !== input.balanceNanos) throw new Error("allocation_idempotency_conflict");
            return existing;
        }
        const wallet = { ...input, reservedNanos: 0, sequence: 0 };
        this.store.put("wallet", wallet);
        this.store.put("opening", input.balanceNanos);
        return wallet;
    }

    wallet(): WalletState {
        const wallet = this.store.get<WalletState>("wallet");
        if (!wallet) throw new Error("workspace_not_published");
        return wallet;
    }

    reservation(id: string): Reservation | undefined {
        identifier(id);
        return this.store.get<Reservation>(`reservation:${id}`);
    }

    private result(before: WalletState, after: WalletState, status: TransitionResult["status"], amount: number,
        applied = false, alreadyApplied = false): TransitionResult {
        return { applied, alreadyApplied, status, amountNanos: amount,
            beforeBalanceNanos: before.balanceNanos, afterBalanceNanos: after.balanceNanos,
            beforeReservedNanos: before.reservedNanos, afterReservedNanos: after.reservedNanos };
    }

    private commit(wallet: WalletState, reservation: Reservation): void {
        nanos(wallet.balanceNanos);
        nanos(wallet.reservedNanos);
        if (wallet.reservedNanos > wallet.balanceNanos) throw new Error("wallet_invariant_violation");
        wallet.sequence = nanos(wallet.sequence + 1);
        this.store.put("wallet", wallet);
        this.store.put(`reservation:${reservation.id}`, reservation);
        const event: LedgerEvent = { version: 1, workspaceId: wallet.workspaceId,
            allocationId: wallet.allocationId, sequence: wallet.sequence, reservation,
            balanceNanos: wallet.balanceNanos, reservedNanos: wallet.reservedNanos };
        this.store.put(`outbox:${String(wallet.sequence).padStart(16, "0")}`, event);
    }

    reserve(input: { id: string; keyId: string; kind: Reservation["kind"]; amountNanos: number; requestCount?: number }, now = Date.now()): TransitionResult {
        identifier(input.id);
        identifier(input.keyId);
        if (input.kind !== "inference" && input.kind !== "hold") throw new Error("invalid_reservation_kind");
        nanos(input.amountNanos);
        const requestCount = input.requestCount ?? 1;
        if (!Number.isSafeInteger(requestCount) || requestCount < 1) throw new Error("invalid_request_count");
        const before = this.wallet();
        const prior = this.reservation(input.id);
        if (prior) {
            if (prior.keyId !== input.keyId || prior.kind !== input.kind || prior.amountNanos !== input.amountNanos ||
                prior.requestCount !== requestCount) throw new Error("reservation_idempotency_conflict");
            // A terminal reservation cannot authorize another provider dispatch.
            return this.result(before, before, prior.status, prior.amountNanos, false, true);
        }
        if (before.balanceNanos - before.reservedNanos < input.amountNanos) {
            return this.result(before, before, "insufficient_funds", input.amountNanos);
        }
        const after = { ...before, reservedNanos: nanos(before.reservedNanos + input.amountNanos) };
        this.commit(after, { ...input, requestCount, actualNanos: null, status: "held", createdAt: now });
        return this.result(before, after, "held", input.amountNanos, true);
    }

    settle(id: string, actualNanos: number): TransitionResult {
        nanos(actualNanos);
        const before = this.wallet();
        const prior = this.reservation(id);
        if (!prior) return this.result(before, before, "not_found", 0);
        if (prior.status === "captured") {
            if (prior.actualNanos !== actualNanos) throw new Error("settlement_idempotency_conflict");
            return this.result(before, before, "captured", actualNanos, false, true);
        }
        if (prior.status !== "held") throw new Error("reservation_already_released");
        // Never consume credit held for another request. An underestimated hold
        // requires an explicit extension; it cannot silently overdraw a wallet.
        if (actualNanos > prior.amountNanos) return this.result(before, before, "reservation_exceeded", actualNanos);
        const after = { ...before, balanceNanos: before.balanceNanos - actualNanos,
            reservedNanos: before.reservedNanos - prior.amountNanos };
        this.commit(after, { ...prior, actualNanos, status: "captured" });
        return this.result(before, after, "captured", actualNanos, true);
    }

    capture(id: string): TransitionResult {
        const prior = this.reservation(id);
        return this.settle(id, prior?.amountNanos ?? 0);
    }

    // Existing synchronous inference bills observed usage after completion;
    // media/batch work instead reserves an explicit hold before dispatch.
    charge(id: string, actualNanos: number): TransitionResult {
        identifier(id);
        nanos(actualNanos);
        const before = this.wallet();
        const prior = this.reservation(id);
        if (prior) {
            if (prior.kind !== "inference" || prior.status !== "captured" || prior.actualNanos !== actualNanos) {
                throw new Error("charge_idempotency_conflict");
            }
            return this.result(before, before, "captured", actualNanos, false, true);
        }
        if (before.balanceNanos - before.reservedNanos < actualNanos) return this.result(before, before, "insufficient_funds", actualNanos);
        const after = { ...before, balanceNanos: before.balanceNanos - actualNanos };
        this.commit(after, { id, keyId: "ordinary-inference", kind: "inference", amountNanos: actualNanos,
            actualNanos, status: "captured", requestCount: 1, createdAt: Date.now() });
        return this.result(before, after, "captured", actualNanos, true);
    }

    release(id: string): TransitionResult {
        const before = this.wallet();
        const prior = this.reservation(id);
        if (!prior) return this.result(before, before, "not_found", 0);
        if (prior.status === "released") return this.result(before, before, "released", prior.amountNanos, false, true);
        if (prior.status !== "held") throw new Error("reservation_already_captured");
        const after = { ...before, reservedNanos: before.reservedNanos - prior.amountNanos };
        this.commit(after, { ...prior, status: "released", actualNanos: 0 });
        return this.result(before, after, "released", prior.amountNanos, true);
    }
}
