import type { BenchmarkSource } from "../types";
import { arcPrize } from "./arc-prize";
import { rampAccountingBench, rampSwebench } from "./ramp";
import { scale } from "./scale";
import { snorkelAle } from "./snorkel";
import { surge } from "./surge";
import { VALS_SOURCES } from "./vals";
import { weirdml } from "./weirdml";
import { zapier } from "./zapier";

/** Every scheduled leaderboard. Add a source here and it runs in the daily sync. */
export const SOURCES: BenchmarkSource[] = [
	arcPrize,
	weirdml,
	...VALS_SOURCES,
	scale,
	surge,
	snorkelAle,
	zapier,
	rampSwebench,
	rampAccountingBench,
];
