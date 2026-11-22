import type { BenchmarkSource } from "../types";
import { andonLabs, corpoBench, deepFinance, exploitBench, frontierBreach, frontierDesign, frontierMemory, frontierPhysics, gdpx, rweBench, solidworksBench } from "./agent-boards";
import { agiPilled } from "./agi-pilled";
import { aider } from "./aider";
import { arcPrize } from "./arc-prize";
import { artificialAnalysis } from "./artificial-analysis";
import { benchmarkHeaven } from "./benchmarkheaven";
import { boardbench } from "./boardbench";
import { boggs } from "./boggs";
import { bsbench } from "./bsbench";
import { bughunt } from "./bughunt";
import { chessLlmBenchmark } from "./chess-llm-benchmark";
import { chessbench } from "./chessbench";
import { clockbench } from "./clockbench";
import { clutterbench } from "./clutterbench";
import { cursorBench, deepSwe, frontierCode, frontierCs, frontierRsi, frontierSwe, kernelBench, longtailSwe, postTrainBench } from "./coding-boards";
import { companyAgentBench } from "./company-agent-bench";
import { designArena } from "./design-arena";
import { dubesorChess } from "./dubesor-chess";
import { duellab } from "./duellab";
import { epochFurniture, epochTasks, frontierMath } from "./epoch";
import { eqbench } from "./eqbench";
import { gamefeel } from "./gamefeel";
import { hearingbench } from "./hearingbench";
import { khalilbench } from "./khalilbench";
import { livebench } from "./livebench";
import { llmChess } from "./llm-chess";
import { llm2014 } from "./llm2014";
import { lmarena } from "./lmarena";
import { mathArena } from "./matharena";
import { mazur } from "./mazur";
import { mercorApex } from "./mercor-apex";
import { metr } from "./metr";
import { minebench } from "./minebench";
import { openttd } from "./openttd";
import { osworld } from "./osworld";
import { rampAccountingBench, rampSwebench } from "./ramp";
import { babyVision, honeyBench, lisanBench, penaltyBench, shadowBench, simpleBench, simpleQa, zeroBench } from "./reasoning-boards";
import { scale } from "./scale";
import { slopalytics } from "./slopalytics";
import { snorkelAle } from "./snorkel";
import { surge } from "./surge";
import { sweRebench } from "./swe-rebench";
import { terminalBench } from "./terminal-bench";
import { threejsEval } from "./threejseval";
import { ugi } from "./ugi";
import { VALS_SOURCES } from "./vals";
import { voxelbench } from "./voxelbench";
import { websitebench } from "./websitebench";
import { weirdml } from "./weirdml";
import { wojakBench3d } from "./wojak-bench-3d";
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
	boggs,
	benchmarkHeaven,
	eqbench,
	aider,
	livebench,
	ugi,
	sweRebench,
	mazur,
	mercorApex,
	companyAgentBench,
	wojakBench3d,
	epochTasks,
	epochFurniture,
	frontierMath,
	metr,
	mathArena,
	terminalBench,
	osworld,
	simpleBench,
	simpleQa,
	lisanBench,
	shadowBench,
	penaltyBench,
	zeroBench,
	babyVision,
	honeyBench,
	deepSwe,
	frontierSwe,
	frontierCode,
	frontierCs,
	cursorBench,
	kernelBench,
	longtailSwe,
	postTrainBench,
	frontierRsi,
	andonLabs,
	frontierMemory,
	frontierPhysics,
	frontierBreach,
	frontierDesign,
	corpoBench,
	gdpx,
	deepFinance,
	exploitBench,
	rweBench,
	solidworksBench,
];
