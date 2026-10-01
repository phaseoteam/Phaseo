import assert from "node:assert/strict";
import { test } from "node:test";
import { operationMetricsSummary } from "./operation-metrics-summary.mjs";

test("tail summaries retain only finite counters, timings and enumerated stream outcomes", () => {
    const summary = operationMetricsSummary({ requestId: "test-request", total: { kvRead: 1, kvWrite: -1, secret: 20 },
        pendingBackground: "private", stream: { state: "COMPLETED", committed: true, deliveredFrames: 3, deliveredBytes: 100,
            firstFrameMs: 0, firstOutputObservedMs: 10, durationMs: 20, finishReason: "stop", errorOrigin: null,
            output: "private", usage: { secret: "private" } } });
    assert.equal(summary.stream.firstFrameMs, 0);
    assert.equal(summary.stream.finishReason, "stop");
    assert.deepEqual(summary.total, { kvRead: 1 });
    assert.equal(summary.pendingBackground, null);
    assert.ok(!JSON.stringify(summary).includes("private"));
    assert.ok(!JSON.stringify(summary).includes("secret"));
});
test("unknown provider strings and invalid timing are never echoed", () => {
    const summary = operationMetricsSummary({ requestId: "test-request", stream: { state: "FAILED", finishReason: "private",
        errorOrigin: "private", firstFrameMs: Infinity, firstOutputObservedMs: -1, durationMs: NaN } });
    for (const key of ["finishReason", "errorOrigin", "firstFrameMs", "firstOutputObservedMs", "durationMs"]) assert.equal(summary.stream[key], null);
    assert.equal(operationMetricsSummary({ requestId: "private text" }), null);
    assert.equal(operationMetricsSummary(null), null);
});
