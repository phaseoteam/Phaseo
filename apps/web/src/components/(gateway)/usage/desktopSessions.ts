export type DesktopSessionTurn = {
  environment_id: string; session_id: string; turn_id: string; provider: "codex" | "claudeAgent";
  model: string; status: "completed" | "failed" | "cancelled" | "interrupted";
  started_at: string; completed_at: string; input_tokens: number | null; output_tokens: number | null;
  usage_status: "complete" | "partial" | "unavailable"; desktop_scheme: "t3code" | "t3code-dev";
};
export function groupDesktopSessions(turns: DesktopSessionTurn[]) {
  const sessions = new Map<string, DesktopSessionTurn & { key: string; turns: number; durationMs: number; tokens: number | null; partial: boolean }>();
  const seen = new Set<string>();
  for (const turn of [...turns].sort((a, b) => b.completed_at.localeCompare(a.completed_at))) {
    const key = JSON.stringify([turn.environment_id, turn.session_id, turn.provider]);
    const turnKey = JSON.stringify([turn.environment_id, turn.turn_id]);
    if (seen.has(turnKey)) continue;
    seen.add(turnKey);
    const current = sessions.get(key) ?? { ...turn, key, turns: 0, durationMs: 0, tokens: null, partial: false };
    current.turns += 1;
    current.durationMs += Math.max(0, Date.parse(turn.completed_at) - Date.parse(turn.started_at));
    if (turn.input_tokens !== null || turn.output_tokens !== null) current.tokens = (current.tokens ?? 0) + (turn.input_tokens ?? 0) + (turn.output_tokens ?? 0);
    current.partial ||= turn.usage_status !== "complete";
    sessions.set(key, current);
  }
  return [...sessions.values()];
}
