import { FreeModelReservationIdentitySchema, type FreeModelReservationIdentity } from "./free-model-fee-identity";
export { FreeModelReservationIdentitySchema, type FreeModelReservationIdentity } from "./free-model-fee-identity";
import { FREE_MODEL_OVERAGE_NANOS } from "./free-model-quota";
import { reserveWalletCredits, captureWalletReservation, releaseWalletReservation } from "./wallet-reservations";

function reservation(input: FreeModelReservationIdentity) {
    const identity = FreeModelReservationIdentitySchema.parse(input);
    return { ...identity, reservationId: `free_model_hold:${identity.requestId}` };
}

/** Explicit paid-overage path only. Included free requests never call this.
 * A hold is not a charge or evidence that a provider received the request.
 * Admission must await an authoritative hold; ambiguous results must not dispatch.
 */
export async function reserveFreeModelOverage(input: FreeModelReservationIdentity, signal?: AbortSignal) {
    const args = reservation(input);
    const result = await reserveWalletCredits({ workspaceId: args.workspaceId, keyId: args.keyId,
        reservationId: args.reservationId, holdRefId: args.auditRequestId ?? args.requestId,
        amountNanos: FREE_MODEL_OVERAGE_NANOS, requestCount: 1, ...(signal ? { signal } : {}) });
    if ((result.applied || result.alreadyApplied) &&
        (result.status !== "held" || result.amountNanos !== FREE_MODEL_OVERAGE_NANOS)) {
        throw new Error("free_model_reservation_confirmation_invalid");
    }
    return result;
}

/** The caller supplies a definitive billable outcome, not a timeout guess.
 * Replays preserve workspace/request/key identity. Unknown outcomes belong in
 * durable reconciliation; they must not silently switch from capture to release.
 */
export async function finalizeFreeModelOverage(input: FreeModelReservationIdentity, outcome: "capture" | "release", signal?: AbortSignal) {
    const args = reservation(input);
    if (outcome !== "capture" && outcome !== "release") throw new Error("invalid_free_model_settlement_outcome");
    const result = outcome === "capture"
        ? await captureWalletReservation({ workspaceId: args.workspaceId, keyId: args.keyId,
            reservationId: args.reservationId, captureRefId: args.requestId, ...(signal ? { signal } : {}) })
        : await releaseWalletReservation({ workspaceId: args.workspaceId, keyId: args.keyId,
            reservationId: args.reservationId, releaseRefId: args.requestId, ...(signal ? { signal } : {}) });
    if ((!result.applied && !result.alreadyApplied) || result.amountNanos !== FREE_MODEL_OVERAGE_NANOS ||
        result.status !== (outcome === "capture" ? "captured" : "released")) {
        throw new Error("free_model_settlement_unconfirmed");
    }
    return result;
}
