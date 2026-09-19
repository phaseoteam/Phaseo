import { getSupabaseAdmin } from "@/runtime/env";
import { recordUsageAndChargeInDatabase } from "@/pipeline/pricing/persist";
import { reserveWalletCreditsInDatabase, captureWalletReservationInDatabase, releaseWalletReservationInDatabase, settleWalletReservationInDatabase } from "../wallet-reservations";
import { publishedWorkspace, workspaceState } from "./client";
import type { LedgerEvent } from "./ledger";

// Background only: normal wallets, credit ledger and reservation RPCs remain
// the reporting/accounting source of truth. There are no escrow/shadow tables.
export async function syncAccountingEvent(event: LedgerEvent): Promise<void> {
    const r = event.reservation;
    if (r.kind === "inference") {
        if (r.status !== "captured" || r.actualNanos === null) throw new Error("invalid_inference_sync_event");
        await recordUsageAndChargeInDatabase({ workspaceId: event.workspaceId, requestId: r.id, cost_nanos: r.actualNanos });
        return;
    }
    const args = { workspaceId: event.workspaceId, reservationId: r.id, keyId: r.keyId };
    const result = r.status === "held"
        ? await reserveWalletCreditsInDatabase({ ...args, amountNanos: r.amountNanos, requestCount: r.requestCount, holdRefId: event.referenceId })
        : r.status === "released"
            ? await releaseWalletReservationInDatabase({ ...args, releaseRefId: event.referenceId })
            : event.operation === "capture"
                ? await captureWalletReservationInDatabase({ ...args, captureRefId: event.referenceId })
                : await settleWalletReservationInDatabase({ ...args, actualNanos: r.actualNanos!, settleRefId: event.referenceId });
    if ((!result.applied && !result.alreadyApplied) || result.status !== r.status) {
        throw new Error(`request_state_billing_sync_failed:${result.status}`);
    }
}

export async function syncWorkspaceAccounting(workspaceId: string) {
    if (workspaceId !== publishedWorkspace()) throw new Error("workspace_not_published");
    const stub = workspaceState(workspaceId);
    for (const event of await stub.pendingEvents()) {
        if (event.workspaceId !== workspaceId) throw new Error("billing_sync_workspace_mismatch");
        // Existing RPC idempotency handles a lost response or a worker restart.
        // Do not acknowledge a rejected hold, failed debit or uncertain result.
        await syncAccountingEvent(event);
        await stub.acknowledgeAccounting(event.sequence);
    }
    const status = await stub.syncStatus();
    if (status.sequence === status.acknowledged) {
        const wallet = await getSupabaseAdmin().from("wallets").select("balance_nanos,reserved_nanos").eq("workspace_id", workspaceId).single();
        if (wallet.error || !wallet.data) throw new Error("wallet_sync_read_failed");
        await stub.refreshWallet({ sequence: status.sequence, balanceNanos: Number(wallet.data.balance_nanos), reservedNanos: Number(wallet.data.reserved_nanos ?? 0) });
    }
    return { ok: true, ...await stub.syncStatus() };
}
