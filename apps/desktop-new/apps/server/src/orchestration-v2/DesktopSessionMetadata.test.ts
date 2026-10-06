import { expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import type { OrchestrationV2Run, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { desktopSessionMetadata } from "./DesktopSessionMetadata.ts";
import { desktopAccountPartition } from "./DesktopSessionSync.ts";
const run = {
  id: "run-1",
  threadId: "chat-1",
  modelSelection: { model: "model-1" },
  startedAt: DateTime.makeUnsafe("2026-10-06T14:00:00Z"),
  completedAt: DateTime.makeUnsafe("2026-10-06T14:00:10Z"),
  status: "completed",
} as unknown as OrchestrationV2Run;
const projection = {
  attempts: [{ id: "attempt-1", runId: "run-1" }],
  providerTurns: [
    {
      runAttemptId: "attempt-1",
      tokenUsage: { usedTokens: 999 },
      turnTokenUsage: { usageStatus: "complete", inputTokens: 0, outputTokens: 12 },
    },
  ],
  messages: [{ content: "private" }],
} as unknown as OrchestrationV2ThreadProjection;
it("exports reported turn counts without context occupancy or content", () => {
  expect(desktopSessionMetadata(projection, run, "codex", "env-1", false)).toMatchObject({
    input_tokens: 0,
    output_tokens: 12,
    usage_status: "complete",
    session_id: "chat-1",
    desktop_scheme: "t3code",
  });
  expect(
    JSON.stringify(desktopSessionMetadata(projection, run, "codex", "env-1", false)),
  ).not.toContain("private");
});
it("marks missing usage unavailable and excludes active or gateway runs", () => {
  const missing = {
    ...projection,
    providerTurns: [{ ...projection.providerTurns[0], turnTokenUsage: undefined }],
  } as OrchestrationV2ThreadProjection;
  expect(desktopSessionMetadata(missing, run, "claudeAgent", "env-1", true)).toMatchObject({
    input_tokens: null,
    output_tokens: null,
    usage_status: "unavailable",
  });
  expect(
    desktopSessionMetadata(projection, { ...run, completedAt: null }, "codex", "env-1", false),
  ).toBeUndefined();
  expect(desktopSessionMetadata(projection, run, "phaseo", "env-1", false)).toBeUndefined();
});
it("partitions retries by verified user and workspace", () => {
  expect(desktopAccountPartition("user", "one")).toBe(desktopAccountPartition("user", "one"));
  expect(desktopAccountPartition("user", "one")).not.toBe(desktopAccountPartition("user", "two"));
  expect(desktopAccountPartition("user", "one")).not.toBe(desktopAccountPartition("other", "one"));
});
