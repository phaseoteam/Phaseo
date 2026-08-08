import type { GameKey } from "./types";
import { GAME_KEYS } from "./types";

export type GameResultRow = {
  game_key: GameKey;
  puzzle_date: string;
  won: boolean;
  score: number;
  max_score: number;
  completed_at: string;
};

const LABELS: Record<GameKey, string> = {
  modele: "Modele",
  timeline: "Model Timeline",
  pricele: "Pricele",
  "head-to-head": "Head-to-Head",
  sprint: "Model Sprint",
};

export function buildGameProfileSummary(rows: GameResultRow[]) {
  const ordered = [...rows].sort((left, right) => right.puzzle_date.localeCompare(left.puzzle_date));
  const activeDates = [...new Set(ordered.map((row) => row.puzzle_date))].sort().reverse();
  let currentStreak = 0;
  if (activeDates.length) {
    let cursor = new Date(`${activeDates[0]}T00:00:00Z`);
    for (const date of activeDates) {
      if (date !== cursor.toISOString().slice(0, 10)) break;
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  return {
    totalPlayed: rows.length,
    totalWins: rows.filter((row) => row.won).length,
    currentStreak,
    averageScore: rows.length
      ? Math.round((rows.reduce((sum, row) => sum + row.score / row.max_score, 0) / rows.length) * 100)
      : 0,
    games: GAME_KEYS.map((game) => {
      const gameRows = ordered.filter((row) => row.game_key === game);
      return {
        game,
        label: LABELS[game],
        played: gameRows.length,
        wins: gameRows.filter((row) => row.won).length,
        bestScore: gameRows.reduce((best, row) => Math.max(best, Math.round((row.score / row.max_score) * 100)), 0),
        lastPlayedAt: gameRows[0]?.completed_at ?? null,
      };
    }),
  };
}
