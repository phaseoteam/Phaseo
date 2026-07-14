import assert from "node:assert/strict";
import { testingExports } from "./update-monitor-history";

function main() {
  assert.equal(testingExports.assertSafeGitRef("HEAD"), "HEAD");
  assert.equal(
    testingExports.assertSafeGitRef("origin/main", "head ref"),
    "origin/main"
  );
  assert.throws(
    () => testingExports.assertSafeGitRef("HEAD; curl attacker", "head ref"),
    /invalid characters|unsafe git revision pattern/
  );
  assert.throws(
    () => testingExports.assertSafeGitRef("../main", "head ref"),
    /unsafe git revision pattern/
  );

  const before = [
    {
      benchmark_id: "aider-polyglot",
      other_info: "With Thinking, Pass @ 1, Diff Method",
      score: 88,
    },
    {
      benchmark_id: "aider-polyglot",
      other_info: "Without Thinking, Pass @ 1, Diff Method",
      score: 26.7,
    },
  ];
  const after = [
    {
      benchmark_id: "aider-polyglot",
      other_info: "With Thinking, Pass @ 1, Diff Method",
      score: 90,
    },
    {
      benchmark_id: "aider-polyglot",
      other_info: "Without Thinking, Pass @ 1, Diff Method",
      score: 26.7,
    },
  ];

  assert.deepEqual(testingExports.diffBenchmarks(before, after, "benchmarks"), [
    {
      field: "benchmarks.aider-polyglot[With Thinking, Pass @ 1, Diff Method].score",
      before: 88,
      after: 90,
    },
  ]);

  assert.deepEqual(testingExports.diffBenchmarks(before, before, "benchmarks"), []);

  assert.equal(
    testingExports.shouldTrackDiff(
      {
        provider: "model",
        model: "minimax/minimax-m3",
        endpoint: null,
        entityType: "model",
        entityId: "minimax/minimax-m3",
        orgId: "minimax",
      },
      {
        field: "links.weights.url",
        before: null,
        after: "https://huggingface.co/MiniMaxAI/MiniMax-M3",
      }
    ),
    true
  );

  assert.equal(
    testingExports.shouldTrackDiff(
      {
        provider: "model",
        model: "xiaomi/mimo-v2-flash",
        endpoint: null,
        entityType: "model",
        entityId: "xiaomi/mimo-v2-flash",
        orgId: "xiaomi",
      },
      {
        field: "deprecation_date",
        before: null,
        after: "2026-06-12T00:00:00",
      }
    ),
    true
  );

  assert.equal(
    testingExports.shouldTrackDiff(
      {
        provider: "model",
        model: "xiaomi/mimo-v2-flash",
        endpoint: null,
        entityType: "model",
        entityId: "xiaomi/mimo-v2-flash",
        orgId: "xiaomi",
      },
      {
        field: "retirement_date",
        before: null,
        after: "2026-06-18T00:00:00",
      }
    ),
    true
  );

  const providerModelDiffs = testingExports.diffModelList(
    [{ api_model_id: "cohere/command-a" }],
    [
      { api_model_id: "cohere/command-a" },
      { api_model_id: "cohere/north-mini-code-1-0", status: "active" },
    ],
    "models"
  );

  assert.deepEqual(providerModelDiffs, [
    {
      field: "models.cohere/north-mini-code-1-0",
      before: null,
      after: "cohere/north-mini-code-1-0",
      kind: "provider-model-listing",
      modelId: "cohere/north-mini-code-1-0",
    },
    {
      field: "models.cohere/north-mini-code-1-0[status]",
      before: null,
      after: "active",
      kind: "provider-model-status",
      modelId: "cohere/north-mini-code-1-0",
    },
  ]);

  const providerListingEntry = testingExports.toProviderModelListingEntry(
    "abc123",
    "packages/data/catalog/src/data/api_providers/cohere/models.json",
    "2026-06-09T08:52:35+00:00",
    {
      provider: "api-provider",
      model: "cohere",
      endpoint: null,
      entityType: "api-provider",
      entityId: "cohere",
      orgId: "cohere",
    },
    providerModelDiffs[0]
  );

  assert.ok(providerListingEntry);
  assert.equal(providerListingEntry?.provider, "api-provider");
  assert.equal(providerListingEntry?.entityType, "api-provider");
  assert.equal(providerListingEntry?.entityId, "cohere");
  assert.equal(providerListingEntry?.model, "cohere/north-mini-code-1-0");
  assert.equal(providerListingEntry?.action, "added");
  assert.equal(providerListingEntry?.field, "");
  assert.equal(providerListingEntry?.oldValue, null);
  assert.equal(providerListingEntry?.newValue, "Listed");

  const providerStatusEntry = testingExports.toProviderModelStatusEntry(
    "abc123",
    "packages/data/catalog/src/data/api_providers/cohere/models.json",
    "2026-06-09T08:52:35+00:00",
    {
      provider: "api-provider",
      model: "cohere",
      endpoint: null,
      entityType: "api-provider",
      entityId: "cohere",
      orgId: "cohere",
    },
    providerModelDiffs[1]
  );

  assert.ok(providerStatusEntry);
  assert.equal(providerStatusEntry?.provider, "api-provider");
  assert.equal(providerStatusEntry?.entityType, "api-provider");
  assert.equal(providerStatusEntry?.entityId, "cohere");
  assert.equal(providerStatusEntry?.model, "cohere/north-mini-code-1-0");
  assert.equal(providerStatusEntry?.action, "changed");
  assert.equal(providerStatusEntry?.field, "status");
  assert.equal(providerStatusEntry?.oldValue, null);
  assert.equal(providerStatusEntry?.newValue, "active");

  const providerStatusChangeDiffs = testingExports.diffModelList(
    [{ api_model_id: "anthropic/claude-fable-5", status: "coming_soon" }],
    [{ api_model_id: "anthropic/claude-fable-5", status: "active" }],
    "models"
  );

  assert.deepEqual(providerStatusChangeDiffs, [
    {
      field: "models.anthropic/claude-fable-5[status]",
      before: "coming_soon",
      after: "active",
      kind: "provider-model-status",
      modelId: "anthropic/claude-fable-5",
    },
  ]);

  const inferredGatewayStatusDiffs = testingExports.diffModelList(
    [{ api_model_id: "cohere/command-a", is_active_gateway: false }],
    [
      { api_model_id: "cohere/command-a", is_active_gateway: false },
      {
        api_model_id: "cohere/north-mini-code-1-0",
        is_active_gateway: false,
      },
    ],
    "models"
  );

  assert.deepEqual(inferredGatewayStatusDiffs, [
    {
      field: "models.cohere/north-mini-code-1-0",
      before: null,
      after: "cohere/north-mini-code-1-0",
      kind: "provider-model-listing",
      modelId: "cohere/north-mini-code-1-0",
    },
    {
      field: "models.cohere/north-mini-code-1-0[status]",
      before: null,
      after: "inactive",
      kind: "provider-model-status",
      modelId: "cohere/north-mini-code-1-0",
    },
  ]);

  console.log("update-monitor-history tests passed");
}

main();
