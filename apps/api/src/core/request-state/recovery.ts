import { getBindings } from "@/runtime/env";
import { runBatchReconciliationJob } from "@/pipeline/batch-reconciliation";
import { runVideoReconciliationJob } from "@/pipeline/video-reconciliation";
import { runAsyncWebhookRetriesJob } from "../async-notifications";
import { runRealtimeSessionReconciliationJob } from "../realtime-sessions";
import { publishedWorkspace } from "./client";

// Reuse the existing lifecycle engines; their repository entrypoints select the
// opted-in workspace DO. Never invoke the production-wide scheduled handler.
export async function recoverPublishedWorkspace(workspaceId: string) {
    if (workspaceId !== publishedWorkspace()) throw new Error("workspace_not_published");
    const env = getBindings();
    const results = await Promise.allSettled([
        runBatchReconciliationJob({ limit: 10, concurrency: 2 }),
        runVideoReconciliationJob({ limit: 10, concurrency: 2 }),
        runRealtimeSessionReconciliationJob({ limit: 10, relay: env.REALTIME_RELAY }),
        runAsyncWebhookRetriesJob({ limitPerKind: 10, maxPagesPerKind: 1, maxDeliveries: 10, baseUrl: env.GATEWAY_PUBLIC_BASE_URL }),
    ]);
    const names = ["batch", "video", "realtime", "webhooks"] as const;
    const failed = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []);
    if (failed.length) {
        console.error("request_state_recovery_failed", { components: failed });
        throw new Error("request_state_recovery_incomplete");
    }
    return { ok: true };
}
