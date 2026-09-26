import assert from "node:assert/strict";
import { test } from "node:test";
import { operationMetricsSummary } from "./operation-metrics-summary.mjs";

test("waterfall summaries bound cardinality, validate intervals and strip arbitrary fields", () => {
    const valid = { stage: "context.private", startMs: 0, endMs: 30, state: "fulfilled", secret: "private-data" };
    const pending = { stage: "auth.source", startMs: 3, endMs: null, state: "pending" };
    const summary = operationMetricsSummary({ requestId: "test", dispatchTimings: [valid, pending,
        { ...valid, stage: "private-data" }, { ...valid, startMs: -1 }, { ...valid, endMs: -1 },
        { ...valid, state: "private-data" }, { ...valid, endMs: Infinity }, { ...pending, endMs: 5 }, null] });
    assert.deepEqual(summary.dispatchTimings, [{ stage: "context.private", startMs: 0, endMs: 30, state: "fulfilled" }, pending]);
    assert.ok(!JSON.stringify(summary).includes("private-data"));
    const capped = operationMetricsSummary({ requestId: "test", dispatchTimings: Array(100).fill(valid) });
    assert.equal(capped.dispatchTimings.length, 64);
    assert.equal(capped.dispatchTimingsOverflow, true);
});

test("settlement attribution exposes only bounded fields, never financial identities or raw errors", () => {
    for (const state of ["pending", "confirmed", "recovery_queued", "unresolved"]) {
        const summary = operationMetricsSummary({ requestId: "test-request", settlement: {
            state, directAttempts: 3, cost_nanos: 100, workspaceId: "private", error: "secret",
        } });
        assert.deepEqual(summary.settlement, { state, directAttempts: 3 });
        assert.ok(!JSON.stringify(summary).match(/private|secret|cost_nanos/));
    }
    for (const settlement of [null, {}, { state: "secret", directAttempts: 3 },
        ...[-1, 1.5, Infinity, NaN, "3", Number.MAX_SAFE_INTEGER + 1].map(directAttempts => ({ state: "confirmed", directAttempts }))]) {
        assert.ok(!Object.hasOwn(operationMetricsSummary({ requestId: "test-request", settlement }), "settlement"));
    }
});

test("quota attribution retains only the admission enum, not identities or raw replies", () => {
    for (const quotaAdmission of ["included", "edge_limited", "rpm_limited", "daily_limited", "unavailable", "overage_blocked"]) {
        const summary = operationMetricsSummary({ requestId: "test-request", quotaAdmission,
            owner: "private", quota: { remaining: 999, secret: "private" } });
        assert.equal(summary.quotaAdmission, quotaAdmission);
        assert.ok(!JSON.stringify(summary).includes("private"));
    }
    for (const quotaAdmission of [undefined, null, "private", { outcome: "included", owner: "private" }, ["included"]]) {
        assert.ok(!Object.hasOwn(operationMetricsSummary({ requestId: "test-request", quotaAdmission }), "quotaAdmission"));
    }
});

test("cost attribution retains only fixed categories and a valid module marker", () => {
    const runtimeInstanceId = "12345678-1234-4123-8123-123456789012";
    const summary = operationMetricsSummary({ requestId: "test-request", runtimeInstanceId,
        total: { settlementEnqueue: 1 }, kvByPurpose: { sticky: { kvWrite: 3, healthRpc: 7, secret: "private" },
            auth: { kvRead: 2, kvWrite: -1 }, private: { kvWrite: 999 }, other: null } });
    assert.equal(summary.runtimeInstanceId, runtimeInstanceId);
    assert.deepEqual(summary.total, { settlementEnqueue: 1 });
    assert.deepEqual(summary.kvByPurpose, { auth: { kvRead: 2 }, sticky: { kvWrite: 3 } });
    assert.ok(!JSON.stringify(summary).includes("private"));
    for (const marker of ["private", {}, runtimeInstanceId + "private", null]) {
        assert.ok(!Object.hasOwn(operationMetricsSummary({ requestId: "test-request", runtimeInstanceId: marker }), "runtimeInstanceId"));
    }
});

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
