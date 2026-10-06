import { groupDesktopSessions, type DesktopSessionTurn } from "./desktopSessions";
const turn: DesktopSessionTurn = { environment_id: "env", session_id: "chat", turn_id: "turn-1", provider: "codex", model: "old", status: "completed", started_at: "2026-10-06T14:00:00Z", completed_at: "2026-10-06T14:00:10Z", input_tokens: 0, output_tokens: 5, usage_status: "complete", desktop_scheme: "t3code" };
it("groups sessions in order, deduplicates retries and keeps unknown usage honest", () => {
  const newer = { ...turn, turn_id: "turn-2", model: "new", completed_at: "2026-10-06T14:00:20Z", input_tokens: null, output_tokens: null, usage_status: "unavailable" as const };
  const sessions = groupDesktopSessions([turn, newer, turn]);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ model: "new", turns: 2, tokens: 5, partial: true, durationMs: 30000 });
  expect(groupDesktopSessions([{ ...newer, session_id: "other" }, turn])).toHaveLength(2);
});
