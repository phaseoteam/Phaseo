import { z } from "zod";
import { configureRuntime, clearRuntime, getBindingsIfConfigured, setWaitUntil } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import { countOperation } from "@/runtime/request-operations";

const nanos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const SettlementRecoveryRecord = z.object({
    version: z.literal(1), workspaceId: z.string().uuid(),
    requestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    cost_nanos: nanos.positive(), creditSnapshotBalanceNanos: nanos.nullable(),
    createdAtMs: nanos,
}).strict();
export type SettlementRecoveryRecord = z.infer<typeof SettlementRecoveryRecord>;
type ChargeInput = Pick<SettlementRecoveryRecord, "workspaceId" | "requestId" | "cost_nanos" | "creditSnapshotBalanceNanos">;
const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Only the exhausted-charge path calls this. No per-success queue operation.
 * Await send confirmation before marking ownership transferred to recovery. */
export async function enqueueSettlementRecovery(input: ChargeInput): Promise<boolean> {
    const env = getBindingsIfConfigured();
    if (env?.GATEWAY_SETTLEMENT_RECOVERY_ENABLED !== "true") return false;
    if (!env.SETTLEMENT_RECOVERY_QUEUE || !env.SETTLEMENT_RECOVERY_DEAD_LETTER || !env.GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME) {
        throw new Error("settlement_recovery_not_configured");
    }
    const record = SettlementRecoveryRecord.parse({ ...input, version: 1, createdAtMs: Date.now() });
    countOperation("settlementEnqueue");
    await env.SETTLEMENT_RECOVERY_QUEUE.send(record, { contentType: "json" });
    return true;
}

/** Uses the SAME immutable billing identity and DB amount fence, never a queue
 * message ID. Dead letters are retained for operator reconciliation, not dropped
 * or auto-replayed. One record at a time bounds concurrent source pressure. */
export async function handleSettlementRecoveryBatch(batch: MessageBatch<unknown>, env: GatewayBindings, execution: ExecutionContext): Promise<void> {
    if (env.GATEWAY_SETTLEMENT_RECOVERY_ENABLED !== "true" || !env.GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME
        || batch.queue !== env.GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME || !env.SETTLEMENT_RECOVERY_DEAD_LETTER) {
        batch.retryAll({ delaySeconds: 300 });
        console.error("settlement_recovery_configuration_error");
        return;
    }
    configureRuntime(env);
    const releaseWaitUntil = setWaitUntil(execution.waitUntil.bind(execution));
    const counts = { settled: 0, retry: 0, quarantined: 0 };
    try {
        const { recordUsageAndCharge } = await import("@/pipeline/pricing/persist");
        for (const message of batch.messages) {
            let quarantine = false;
            try {
                const parsed = SettlementRecoveryRecord.safeParse(message.body);
                const age = parsed.success ? Date.now() - parsed.data.createdAtMs : 0;
                quarantine = !parsed.success || age > MAX_AGE_MS || age < -60_000 || message.attempts > MAX_ATTEMPTS;
                if (!quarantine && parsed.success) {
                    const { workspaceId, requestId, cost_nanos, creditSnapshotBalanceNanos } = parsed.data;
                    try {
                        const result = await recordUsageAndCharge({ workspaceId, requestId, cost_nanos, creditSnapshotBalanceNanos });
                        if (!result.applied && !result.already_applied) throw new Error("settlement_not_applied");
                        message.ack();
                        counts.settled++;
                        continue;
                    } catch {
                        quarantine = message.attempts >= MAX_ATTEMPTS;
                    }
                }
                if (quarantine) {
                    // Preserve the original queue body without wrapping/increasing
                    // its size. Queue access is private; never log payloads.
                    await env.SETTLEMENT_RECOVERY_DEAD_LETTER.send(message.body, { contentType: "json" });
                    message.ack();
                    counts.quarantined++;
                    console.error("settlement_recovery_quarantined", { messageId: message.id });
                    continue;
                }
            } catch {
                // Includes failed/ambiguous DLQ writes. Never acknowledge before
                // durable transfer; a duplicate dead letter is safer than loss.
            }
            message.retry({ delaySeconds: quarantine ? 300 : Math.min(30 * 2 ** Math.max(0, message.attempts - 1), 300) });
            counts.retry++;
        }
    } finally {
        releaseWaitUntil();
        clearRuntime();
        console.log("settlement_recovery_batch", counts);
    }
}
