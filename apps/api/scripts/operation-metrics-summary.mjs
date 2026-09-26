const operations = new Set(["kvRead", "kvWrite", "kvDelete", "kvList", "supabaseRead", "supabaseMutation", "supabaseRpc", "healthRpc", "healthDropped", "quotaRpc", "settlementEnqueue", "cacheRead", "cacheWrite"]);
const kvOperations = new Set(["kvRead", "kvWrite", "kvDelete", "kvList"]);
const kvPurposes = ["auth", "credit", "sticky", "context", "health", "other"];
const quotaOutcomes = new Set(["included", "edge_limited", "rpm_limited", "daily_limited", "unavailable", "overage_blocked"]);
const settlementOutcomes = new Set(["pending", "confirmed", "recovery_queued", "unresolved"]);
const dispatchStages = new Set(["auth.version", "auth.cache", "auth.source", "context.preset", "context.private",
    "context.versions", "context.cache", "credit.cache", "catalog.cache", "workspace.cache", "context.source",
    "catalog.refill", "workspace.refill", "context.hydration", "supabase.headers", "quota.edge", "quota.admission"]);
const counts = value => Object.fromEntries(Object.entries(value ?? {}).filter(([key, count]) => operations.has(key) && Number.isSafeInteger(count) && count >= 0));
const duration = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Tail output is a separate trust boundary. Do not print unfiltered Worker logs. */
export function operationMetricsSummary(record) {
    if (!record || typeof record.requestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(record.requestId)) return null;
    const stream = record.stream;
    const dispatchTimings = Array.isArray(record.dispatchTimings) ? record.dispatchTimings.slice(0, 64).flatMap(timing => {
        if (!timing || !dispatchStages.has(timing.stage) || duration(timing.startMs) === null) return [];
        const pending = timing.state === "pending" && timing.endMs === null;
        const settled = ["fulfilled", "rejected"].includes(timing.state) && duration(timing.endMs) !== null && timing.endMs >= timing.startMs;
        return pending || settled ? [{ stage: timing.stage, startMs: timing.startMs, endMs: timing.endMs, state: timing.state }] : [];
    }) : undefined;
    const safeStream = stream && ["COMPLETED", "FAILED", "CANCELLED"].includes(stream.state) ? {
        state: stream.state, committed: stream.committed === true,
        deliveredFrames: count(stream.deliveredFrames), deliveredBytes: count(stream.deliveredBytes),
        downstreamDisconnected: stream.downstreamDisconnected === true, sawFinalUsage: stream.sawFinalUsage === true,
        finishReason: ["stop", "length", "tool_calls", "content_filter", "error", "other"].includes(stream.finishReason) ? stream.finishReason : null,
        errorOrigin: ["provider", "gateway", "client"].includes(stream.errorOrigin) ? stream.errorOrigin : null,
        firstFrameMs: duration(stream.firstFrameMs), firstOutputObservedMs: duration(stream.firstOutputObservedMs), durationMs: duration(stream.durationMs),
    } : undefined;
    return { event: "gateway_operations", requestId: record.requestId,
        ...(quotaOutcomes.has(record.quotaAdmission) ? { quotaAdmission: record.quotaAdmission } : {}),
        ...(dispatchTimings ? { dispatchTimings, dispatchTimingsOverflow: record.dispatchTimingsOverflow === true || record.dispatchTimings.length > 64 } : {}),
        ...(settlementOutcomes.has(record.settlement?.state) && count(record.settlement?.directAttempts) !== null
            ? { settlement: { state: record.settlement.state, directAttempts: record.settlement.directAttempts } } : {}),
        ...(typeof record.runtimeInstanceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.runtimeInstanceId)
            ? { runtimeInstanceId: record.runtimeInstanceId } : {}),
        kvByPurpose: Object.fromEntries(kvPurposes.filter(purpose => record.kvByPurpose?.[purpose])
            .map(purpose => [purpose, Object.fromEntries(Object.entries(counts(record.kvByPurpose[purpose])).filter(([key]) => kvOperations.has(key)))])),
        total: counts(record.total), beforeDispatch: counts(record.beforeDispatch),
        beforeDispatchMs: duration(record.beforeDispatchMs), complete: record.complete === true,
        pendingBackground: count(record.pendingBackground), ...(safeStream ? { stream: safeStream } : {}) };
}
