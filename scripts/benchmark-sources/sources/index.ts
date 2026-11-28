import type { BenchmarkSource } from "../types";
import { agiPilled } from "./agi-pilled";
import { arcPrize } from "./arc-prize";
import { artificialAnalysis } from "./artificial-analysis";
import { boardbench } from "./boardbench";
import { bsbench } from "./bsbench";
import { bughunt } from "./bughunt";
import { chessLlmBenchmark } from "./chess-llm-benchmark";
import { chessbench } from "./chessbench";
import { clockbench } from "./clockbench";
import { clutterbench } from "./clutterbench";
import { designArena } from "./design-arena";
import { dubesorChess } from "./dubesor-chess";
import { duellab } from "./duellab";
import { gamefeel } from "./gamefeel";
import { hearingbench } from "./hearingbench";
import { khalilbench } from "./khalilbench";
import { llmChess } from "./llm-chess";
import { llm2014 } from "./llm2014";
import { lmarena } from "./lmarena";
import { minebench } from "./minebench";
import { openttd } from "./openttd";
import { rampAccountingBench, rampSwebench } from "./ramp";
import { scale } from "./scale";
import { slopalytics } from "./slopalytics";
import { snorkelAle } from "./snorkel";
import { surge } from "./surge";
import { threejsEval } from "./threejseval";
import { VALS_SOURCES } from "./vals";
import { voxelbench } from "./voxelbench";
import { websitebench } from "./websitebench";
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
	dubesorChess,
	llmChess,
	chessLlmBenchmark,
	chessbench,
	duellab,
	minebench,
	voxelbench,
	threejsEval,
	gamefeel,
	boardbench,
	openttd,
	websitebench,
	clutterbench,
	bsbench,
	bughunt,
	clockbench,
	hearingbench,
	khalilbench,
	agiPilled,
	llm2014,
	slopalytics,
	artificialAnalysis,
	lmarena,
	designArena,
];
