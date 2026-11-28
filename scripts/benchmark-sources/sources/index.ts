import type { BenchmarkSource } from "../types";
import { arcPrize } from "./arc-prize";
import { weirdml } from "./weirdml";

/** Every scheduled leaderboard. Add a source here and it runs in the daily sync. */
export const SOURCES: BenchmarkSource[] = [arcPrize, weirdml];
