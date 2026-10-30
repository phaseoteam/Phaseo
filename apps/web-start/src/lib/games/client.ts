import type { DailyPuzzle, GameKey } from "./types";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 404 ? "preview_disabled" : "puzzle_unavailable"
    );
  return response.json() as Promise<T>;
}

export function fetchDailyPuzzle(game: GameKey): Promise<DailyPuzzle> {
  return jsonRequest<DailyPuzzle>(`/api/_web/games/${game}/today`);
}

export async function checkPuzzle<T>(
  game: GameKey,
  puzzleId: string,
  payload: Record<string, unknown>
): Promise<T> {
  const accessToken = await getBrowserAccessToken().catch(() => null);
  return jsonRequest<T>(`/api/_web/games/${game}/check`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: JSON.stringify({ puzzleId, ...payload }),
  });
}
