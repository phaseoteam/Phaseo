import type { GameKey } from "@/lib/games/types";

const STORAGE_VERSION = 1;

function storageKey(game: GameKey, puzzleId: string): string {
  return `phaseo:catalogue-games:v${STORAGE_VERSION}:${game}:${puzzleId}`;
}

export function readGameState<T>(
  game: GameKey,
  puzzleId: string,
  fallback: T
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(game, puzzleId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { version?: number; state?: T };
    return parsed.version === STORAGE_VERSION && parsed.state
      ? parsed.state
      : fallback;
  } catch {
    return fallback;
  }
}

export function writeGameState<T>(
  game: GameKey,
  puzzleId: string,
  state: T
): void {
  try {
    window.localStorage.setItem(
      storageKey(game, puzzleId),
      JSON.stringify({ version: STORAGE_VERSION, state })
    );
  } catch {
    // The game remains playable when storage is unavailable.
  }
}
