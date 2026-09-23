const operations = new Set(["kvRead", "kvWrite", "kvDelete", "kvList", "supabaseRead", "supabaseMutation", "supabaseRpc", "healthRpc", "healthDropped", "quotaRpc", "cacheRead", "cacheWrite"]);
const counts = value => Object.fromEntries(Object.entries(value ?? {}).filter(([key, count]) => operations.has(key) && Number.isSafeInteger(count) && count >= 0));
const duration = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Tail output is a separate trust boundary. Do not print unfiltered Worker logs. */
export function operationMetricsSummary(record) {
    if (!record || typeof record.requestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(record.requestId)) return null;
    const stream = record.stream;
    const safeStream = stream && ["COMPLETED", "FAILED", "CANCELLED"].includes(stream.state) ? {
        state: stream.state, committed: stream.committed === true,
        deliveredFrames: count(stream.deliveredFrames), deliveredBytes: count(stream.deliveredBytes),
        downstreamDisconnected: stream.downstreamDisconnected === true, sawFinalUsage: stream.sawFinalUsage === true,
        finishReason: ["stop", "length", "tool_calls", "content_filter", "error", "other"].includes(stream.finishReason) ? stream.finishReason : null,
        errorOrigin: ["provider", "gateway", "client"].includes(stream.errorOrigin) ? stream.errorOrigin : null,
        firstFrameMs: duration(stream.firstFrameMs), firstOutputObservedMs: duration(stream.firstOutputObservedMs), durationMs: duration(stream.durationMs),
    } : undefined;
    return { event: "gateway_operations", requestId: record.requestId,
        total: counts(record.total), beforeDispatch: counts(record.beforeDispatch),
        beforeDispatchMs: duration(record.beforeDispatchMs), complete: record.complete === true,
        pendingBackground: count(record.pendingBackground), ...(safeStream ? { stream: safeStream } : {}) };
}
