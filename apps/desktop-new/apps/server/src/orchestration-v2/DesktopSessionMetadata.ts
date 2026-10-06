import type { OrchestrationV2Run, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Only explicitly reported turn usage is exported; context occupancy is not usage. */
export function desktopSessionMetadata(
  projection: OrchestrationV2ThreadProjection,
  run: OrchestrationV2Run,
  provider: string,
  environmentId: string,
  development: boolean,
) {
  if (
    !["codex", "claudeAgent"].includes(provider) ||
    !run.startedAt ||
    !run.completedAt ||
    !["completed", "failed", "cancelled", "interrupted"].includes(run.status)
  )
    return undefined;
  const attemptIds = new Set(
    projection.attempts.filter((attempt) => attempt.runId === run.id).map((attempt) => attempt.id),
  );
  const turns = projection.providerTurns.filter(
    (turn) => turn.runAttemptId !== null && attemptIds.has(turn.runAttemptId),
  );
  const usages = turns.map((turn) => turn.turnTokenUsage);
  const input = usages.flatMap((usage) =>
    usage?.inputTokens === undefined ? [] : [usage.inputTokens],
  );
  const output = usages.flatMap((usage) =>
    usage?.outputTokens === undefined ? [] : [usage.outputTokens],
  );
  const complete = usages.length > 0 && usages.every((usage) => usage?.usageStatus === "complete");
  return {
    environment_id: environmentId,
    session_id: run.threadId,
    turn_id: run.id,
    provider,
    model: run.modelSelection.model,
    status: run.status,
    started_at: DateTime.formatIso(run.startedAt),
    completed_at: DateTime.formatIso(run.completedAt),
    input_tokens: input.length ? input.reduce((a, b) => a + b, 0) : null,
    output_tokens: output.length ? output.reduce((a, b) => a + b, 0) : null,
    usage_status: complete ? "complete" : input.length || output.length ? "partial" : "unavailable",
    desktop_scheme: development ? "t3code-dev" : "t3code",
  };
}
