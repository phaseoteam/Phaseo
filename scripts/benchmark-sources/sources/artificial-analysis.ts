import { decryptPublicData, publicDataManifest } from "../../artificial-analysis/public-page";
import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";

/**
 * Artificial Analysis measures beyond the four Intelligence/Coding/Agentic/cost metrics the API import already stores
 * (aa-intelligence-index-v5, aa-coding-index-v5, aa-agentic-index-v5, aa-intelligence-index-cost-v5) and the Progress
 * Index. AA's pages load one encrypted data file each; we read three: every model configuration with its evaluation
 * scores (any evaluation page), the models page dataset (3D, personality, speed, price, cost per task), and the
 * providers leaderboard (endpoint error rate).
 */
const SITE = "https://artificialanalysis.ai";
const PAGES = {
	evals: `${SITE}/evaluations/artificial-analysis-cyber-index`,
	models: `${SITE}/models`,
	endpoints: `${SITE}/leaderboards/providers`,
} as const;
type Dataset = keyof typeof PAGES;
/** Each page loads several data files; the one we want belongs to the component holding this prop. */
const OWNER_KEYS: Record<Dataset, string> = { evals: "initialModels", models: "initialModels", endpoints: "initialRows" };

export type AaConfig = Record<string, unknown> & {
	id: string;
	name: string;
	release?: { slug?: string; name?: string } | null;
	effort?: { slug?: string } | null;
	performanceDataSource?: { type?: string; providerName?: string } | null;
	priceDataSource?: { type?: string; providerName?: string } | null;
	headline?: { outputSpeed?: number; timeToFirstToken?: number } | null;
};
export type AaEndpoint = {
	host?: { name?: string } | null;
	model?: { release?: { slug?: string } | null } | null;
	performance?: { outputSpeed?: number; timeToFirstToken?: number; endpointErrorRate?: number | null } | null;
};
type Reading = { value: number; ciLow?: number; ciHigh?: number; note?: string };
type Measure = Omit<BenchmarkDefinition, "url" | "type" | "unit"> & {
	page: string;
	dataset: Exclude<Dataset, "endpoints">;
	/** "share" values are 0–1 and stored as percentages; "number" values are stored as published. */
	scale: "share" | "number";
	unit?: string;
	/** `creator` is the lab's own endpoint behind the config's headline speed and latency, when it can be verified. */
	read(row: AaConfig, creator?: AaEndpoint): Reading | number | null | undefined;
};

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const at = (row: unknown, ...path: string[]): unknown => path.reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), row);
const field = (name: string) => (row: AaConfig) => num(row[name]);
/** An Elo with its published interval, stored under two field names AA uses. */
const elo = (name: string, interval: (row: AaConfig) => [unknown, unknown]) => (row: AaConfig): Reading | undefined => {
	const value = num(row[name]);
	if (value === undefined) return undefined;
	const [low, high] = interval(row);
	return { value, ciLow: num(low), ciHigh: num(high) };
};
/** Price only where AA priced the lab's own API, not a median across hosts. */
const firstPartyPrice = (read: (row: AaConfig) => number | undefined) => (row: AaConfig): Reading | undefined => {
	const origin = row.priceDataSource;
	const value = read(row);
	if (origin?.type !== "firstParty" || value === undefined) return undefined;
	return { value, note: origin.providerName ? `measured on ${origin.providerName}'s API` : undefined };
};
/** Speed and latency only where the endpoint they were measured on is verifiably the lab's own (see creatorEndpoint). */
const firstPartyPerformance = (read: (row: AaConfig) => number | undefined) => (row: AaConfig, creator?: AaEndpoint): Reading | undefined => {
	const value = read(row);
	if (!creator || value === undefined) return undefined;
	return { value, note: `measured on ${creator.host?.name}'s API` };
};

const words = (name?: string) => (name ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/**
 * Whether an endpoint host is the model creator's own platform: the same name ("Z AI" and "Zai"), or the creator's
 * name followed by a product ("Amazon" → "Amazon Bedrock", "Alibaba" → "Alibaba Cloud", "Microsoft" → "Microsoft
 * Azure"). A different company ("IBM" and "DeepInfra") is not.
 */
export function hostedByCreator(provider?: string, host?: string): boolean {
	const [creator, platform] = [words(provider), words(host)];
	if (!creator.length || !platform.length) return false;
	return creator.join("") === platform.join("") || creator.every((word, index) => platform[index] === word);
}

/**
 * The lab's own endpoint behind a config's headline speed and latency. AA tags those figures "firstParty" with the
 * creator's name, and the providers board lists every host per release, so the endpoint is the one on that release
 * whose speed and latency are the headline figures. When that endpoint isn't unique, or its host isn't the creator's
 * (AA has tagged a DeepInfra endpoint as IBM's), there is no creator measurement.
 */
export function creatorEndpoint(row: AaConfig, endpoints: AaEndpoint[]): AaEndpoint | undefined {
	const source = row.performanceDataSource;
	const speed = num(row.headline?.outputSpeed);
	const latency = num(row.headline?.timeToFirstToken);
	if (source?.type !== "firstParty" || speed === undefined || latency === undefined || !row.release?.slug) return undefined;
	const matches = endpoints.filter((endpoint) => endpoint.model?.release?.slug === row.release!.slug && endpoint.performance?.outputSpeed === speed && endpoint.performance?.timeToFirstToken === latency);
	return matches.length === 1 && hostedByCreator(source.providerName, matches[0].host?.name) ? matches[0] : undefined;
}

const share = (id: string, name: string, page: string, category: string, fieldName: string, description: string, higherIsBetter = true): Measure =>
	({ id, name, page, category, description, higherIsBetter, dataset: "evals", scale: "share", read: field(fieldName) });

const OMNISCIENCE_DOMAINS: Array<[string, string]> = [
	["Business", "business"],
	["Health", "health"],
	["Humanities & Social Sciences", "humanities-social-sciences"],
	["Law", "law"],
	["Science, Engineering & Mathematics", "science-engineering-mathematics"],
	["Software Engineering (SWE)", "software-engineering"],
];
const PERSONALITY_INDEXES: Array<[string, string, string]> = [
	["expressiveness", "Expressiveness", "rich, varied, well-crafted language"],
	["organization", "Organization", "well-structured, scannable, answer-first replies"],
	["informativeness", "Informativeness", "practical depth, evidence and actionable content"],
	["transparency", "Transparency", "truthful, acknowledges uncertainty, non-sycophantic"],
	["warmth", "Warmth", "friendly, humorous, sincere, emotionally attuned"],
	["conviction", "Conviction", "direct, confident positions and constructive pushback"],
	["imagination", "Imagination", "creative, exploratory, open-ended thinking"],
	["slop", "Slop", "use of filler and generic language"],
];

const ev = (slug: string) => `${SITE}/evaluations/${slug}`;
const MEASURES: Measure[] = [
	// Agentic and knowledge work
	{ id: "aa-3d", name: "AA-3D", page: ev("aa-3d"), category: "3d", dataset: "models", scale: "number", unit: "Elo", higherIsBetter: true, read: elo("aa3dElo", (row) => [at(row, "aa3dEloInterval", "lower"), at(row, "aa3dEloInterval", "upper")]), description: "An agent in an offline sandbox turns a written brief into an interactive three.js scene. Elo rating from blind pairwise votes, with its interval." },
	share("aa-analyst-agent", "AA-AnalystAgent", ev("aa-analyst-agent"), "agents", "analystAgent", "An agent works with real-world spreadsheets and documents to answer the quantitative questions a business or data analyst faces. Artificial Analysis' headline score, as a percentage."),
	{ id: "aa-briefcase", name: "AA-Briefcase v1.1", page: ev("aa-briefcase"), category: "agents", dataset: "evals", scale: "number", unit: "Elo", higherIsBetter: true, read: elo("briefcaseElo", (row) => [at(row, "briefcaseBreakdown", "lower95ci"), at(row, "briefcaseBreakdown", "upper95ci")]), description: "An agent completes long-horizon business workflows that need deliverables such as spreadsheets, presentations and memos. Elo rating with a 95% interval." },
	share("aa-automationbench", "AutomationBench-AA", ev("automationbench-aa"), "agents", "automationBenchPartialScore", "An agent completes tasks across simulated SaaS applications. Share of each task's objectives completed without guardrail violations."),
	share("aa-apex-agents", "APEX-Agents-AA", ev("apex-agents-aa"), "agents", "apexAgents", "Artificial Analysis' run of Mercor's APEX-Agents: long-horizon, cross-application tasks in professional-services environments with realistic tools. Headline score as a percentage."),
	share("aa-enterpriseops-gym", "EnterpriseOps-Gym-AA", ev("enterprise-ops-gym-aa"), "agents", "enterpriseOpsGym", "Artificial Analysis' run of ServiceNow's EnterpriseOps-Gym: stateful, multi-step enterprise workflows across eight business domains through live tool use. Graded on the final state of the underlying databases."),
	{ id: "aa-gdpval-v2-1", name: "GDPval-AA v2.1", page: ev("gdpval-aa"), category: "agents", dataset: "evals", scale: "number", unit: "Elo", higherIsBetter: true, read: elo("gdpval", (row) => [at(row, "gdpvalBreakdown", "lower95ci"), at(row, "gdpvalBreakdown", "upper95ci")]), description: "Real-world tasks from OpenAI's GDPval across 44 occupations, solved with shell access and web browsing. Elo rating from blind pairwise comparisons, with a 95% interval." },
	share("aa-gdp-pdf", "GDP.pdf", ev("gdp-pdf"), "long_context", "gdpPdfAllPass", "Artificial Analysis' run of Surge AI's GDP.pdf: professional tasks over long real-world PDF documents with detailed criteria. Share of tasks that pass every criterion."),
	share("aa-harvey-lab-v1-1", "Harvey LAB-AA v1.1", ev("harvey-lab-aa"), "legal", "harveyLab", "Artificial Analysis' run of Harvey's Legal Agent Benchmark: 120 private legal tasks across 24 practice areas, with deliverables checked against source documents for hallucinations. Headline pass rate as a percentage."),
	share("aa-itbench", "ITBench-AA", ev("itbench-aa"), "agents", "itbenchSre", "Artificial Analysis' run of IBM's ITBench: an agent finds the root cause of Kubernetes incidents from offline snapshots of alerts, events, traces and topology. Headline SRE score as a percentage."),
	share("aa-mka", "Multimodal Knowledge Agent (MKA)", ev("mka"), "multimodal", "mkaClimbWsr", "Artificial Analysis' run of Google DeepMind's MKA: an agent reads visually dense project files such as drawings, schematics and scans and produces a professional's deliverables. Headline score as a percentage."),
	share("aa-vials", "VIALS-AA", ev("vials-aa"), "multimodal", "vialsScore", "Artificial Analysis' run of Handshake AI's VIALS: the model interprets scientific images from life-sciences workflows and answers questions about their evidence. Headline score as a percentage."),
	{ id: "aa-code2video", name: "Code2Video-AA", page: ev("code2video-aa"), category: "code", dataset: "evals", scale: "number", unit: "Elo", higherIsBetter: true, read: elo("code2videoElo", (row) => [at(row, "code2videoBreakdown", "lower95ci"), at(row, "code2videoBreakdown", "upper95ci")]), description: "Artificial Analysis' run of HeyGen's Code2Video Bench: the model writes one HyperFrames HTML composition per design brief for a short product or brand video. Elo rating with a 95% interval." },
	// Coding and terminal
	share("aa-frontiercode-1-1", "FrontierCode 1.1 (AA)", ev("frontiercode"), "code", "frontierCode", "Artificial Analysis' run of Cognition's FrontierCode 1.1: an agent makes changes to real open-source repositories. Graded on whether maintainers would merge the change."),
	share("aa-frontiercode-2-0", "FrontierCode-AA 2.0", ev("frontiercode-2-0"), "code", "frontierCode20", "Artificial Analysis' run of Cognition's FrontierCode 2.0: 132 tasks in real open-source repositories. Graded on whether a maintainer would merge the agent's change."),
	share("aa-terminal-bench-hard", "Terminal-Bench Hard (AA)", ev("terminalbench-hard"), "agents", "terminalbenchHard", "The hard subset of Terminal-Bench: software engineering, system administration and data processing tasks in a terminal. Share of tasks solved."),
	share("aa-terminal-bench-2-1", "Terminal-Bench 2.1 (AA)", ev("terminalbench-2-1"), "agents", "terminalBench21", "89 curated terminal tasks across software engineering, system administration, data processing, model training and security. Share of tasks solved."),
	share("aa-terminal-bench-4-0", "Terminal-Bench 4.0 (AA)", ev("terminalbench-4-0"), "agents", "terminalBench40", "66 harder terminal tasks across software, machine learning, science, operations, security, hardware and media. Share of tasks solved."),
	share("aa-terminal-bench-science", "Terminal-Bench-Science 0.1 (AA)", ev("terminal-bench-science"), "science", "terminalBenchScience", "70 expert-written research workflows across the life, physical, earth, mathematical and engineering sciences, each completed in a terminal and checked by its own tests. Share of tasks passed."),
	share("aa-scicode", "SciCode (AA)", ev("scicode"), "code", "scicode", "288 scientist-curated coding subproblems from 80 laboratory problems across 16 disciplines. Share solved."),
	share("aa-livecodebench", "LiveCodeBench (AA)", ev("livecodebench"), "code", "livecodebench", "Fresh competitive programming problems from LeetCode, AtCoder and CodeForces. Share solved."),
	// Cyber
	{ id: "aa-cyber-index", name: "Artificial Analysis Cyber Index", page: ev("artificial-analysis-cyber-index"), category: "cybersecurity", dataset: "evals", scale: "number", higherIsBetter: true, read: field("cyberIndex"), description: "Artificial Analysis' index of how models perform on enterprise cyber defense tasks, combining its cyber evaluations. Index score." },
	share("aa-cwe-bench", "CWE-Bench-AA", ev("cwe-bench-aa"), "cybersecurity", "cweBench", "Artificial Analysis' run of Collinear AI's CWE-bench: a coding agent audits a real open-source codebase, finds a vulnerability in a described area and patches it without breaking legitimate behaviour. Headline score as a percentage."),
	share("aa-cwe-bench-refusal-rate", "CWE-Bench-AA refusal rate", ev("cwe-bench-aa"), "cybersecurity", "cweBenchRefusalRate", "Share of CWE-Bench-AA tasks the model refused. Lower is better.", false),
	share("aa-deepsecbench", "DeepsecBench-AA", ev("deepsecbench-aa"), "cybersecurity", "deepsecBench", "Artificial Analysis' run of Vercel's DeepsecBench: an agent reviews real open-source application code and reports the vulnerabilities it finds. Headline score as a percentage."),
	share("aa-deepsecbench-refusal-rate", "DeepsecBench-AA refusal rate", ev("deepsecbench-aa"), "cybersecurity", "deepsecBenchRefusalRate", "Share of DeepsecBench-AA tasks the model refused. Lower is better.", false),
	share("aa-cybergym-e2e", "CyberGym-E2E-AA", ev("cybergym-e2e-aa"), "cybersecurity", "cybergymE2e", "Artificial Analysis' run of Berkeley RDI's CyberGym-E2E: an agent finds real memory-safety vulnerabilities in C/C++ projects, reproduces them with proof-of-concept inputs and patches them without breaking the projects' tests. Headline score as a percentage."),
	share("aa-cybergym-e2e-refusal-rate", "CyberGym-E2E-AA refusal rate", ev("cybergym-e2e-aa"), "cybersecurity", "cybergymE2eRefusalRate", "Share of CyberGym-E2E-AA tasks the model refused. Lower is better.", false),
	// Reasoning and knowledge
	share("aa-critpt", "CritPt (AA)", ev("critpt"), "science", "critpt", "71 unpublished, research-level physics challenges. Share solved."),
	share("aa-critpt-v2", "CritPt v2 (AA)", ev("critpt-v2"), "science", "critptAgentic", "The authors' revision of CritPt: 70 research-level physics challenges, solved with a code-execution tool in an offline Linux sandbox. Share solved."),
	share("aa-critpt-v2-hard", "CritPt v2 hard subset (AA)", ev("critpt-v2"), "science", "critptAgenticHard", "The hard subset of CritPt v2's research-level physics challenges, solved with a code-execution tool. Share solved."),
	share("aa-gpqa-diamond", "GPQA Diamond (AA)", ev("gpqa-diamond"), "science", "gpqa", "The 198 hardest GPQA questions: graduate-level physics, biology and chemistry. Share answered correctly."),
	share("aa-hle", "Humanity's Last Exam (AA)", ev("humanitys-last-exam"), "reasoning", "hle", "2,500 expert-vetted questions across mathematics, sciences and humanities. Share answered correctly."),
	share("aa-hle-diamond", "HLE-Diamond (AA)", ev("hle-diamond"), "reasoning", "hleDiamond", "A cleaned 1,000-question version of Humanity's Last Exam, split evenly between reasoning and knowledge questions. Share answered correctly."),
	share("aa-mmlu-pro", "MMLU-Pro (AA)", ev("mmlu-pro"), "general", "mmluPro", "12,000 graduate-level questions across 14 subjects with ten answer options. Share answered correctly."),
	share("aa-global-mmlu-lite", "Global-MMLU-Lite (AA)", ev("global-mmlu-lite"), "language", "globalMmluLiteScore", "A lightweight multilingual version of MMLU across many languages and cultural contexts. Share answered correctly."),
	share("aa-mmmu-pro", "MMMU-Pro (AA)", ev("mmmu-pro"), "multimodal", "mmmuPro", "Multimodal questions across 30 academic disciplines, filtered so text-only models can't answer them and with ten options. Share answered correctly."),
	share("aa-aime-2025", "AIME 2025 (AA)", ev("aime-2025"), "math", "aime25", "All 30 problems from the 2025 American Invitational Mathematics Examination, with integer answers. Share solved."),
	share("aa-math-500", "MATH-500 (AA)", ev("math-500"), "math", "math500", "500 competition mathematics problems across six domains. Share solved."),
	share("aa-ifbench", "IFBench (AA)", ev("ifbench"), "instruction_following", "ifbench", "58 verifiable, out-of-domain output constraints the model has to follow. Share followed."),
	share("aa-tau2-bench-telecom", "τ²-Bench Telecom (AA)", ev("tau2-bench"), "agents", "tau2", "An agent and a simulated user both act on a shared state to resolve telecom support issues. Share of tasks resolved."),
	share("aa-tau3-banking", "τ³-Banking (AA)", ev("tau3-banking"), "agents", "tauBanking", "An agent navigates a large unstructured knowledge base and makes multi-step tool calls to resolve banking support workflows. Share of tasks resolved."),
	share("aa-lcr-v1-1", "AA-LCR v1.1", ev("artificial-analysis-long-context-reasoning"), "long_context", "lcr", "The model extracts, reasons about and synthesises information from documents of 10k to 100k tokens. Share answered correctly."),
	share("aa-mlcr", "MLCR-AA", ev("mlcr-aa"), "healthcare", "mlcrOverall", "Wisedocs' Medical Long Context Reasoning: reasoning over long, fragmented medical records as claims professionals do. Overall score as a percentage."),
	share("aa-healthbench", "HealthBench (AA)", ev("healthbench"), "healthcare", "healthbench", "OpenAI's HealthBench conversations graded against physician-written rubrics. Score as a percentage."),
	share("aa-healthbench-professional", "HealthBench Professional (AA)", ev("healthbench"), "healthcare", "healthbenchProfessional", "OpenAI's HealthBench Professional: 525 clinician conversations covering consult, writing and research tasks, graded against physician-written rubrics. Score as a percentage."),
	{ id: "aa-omniscience-v1-1", name: "AA-Omniscience v1.1", page: ev("omniscience"), category: "hallucinations", dataset: "evals", scale: "number", higherIsBetter: true, read: field("omniscience"), description: "Factual recall across economically relevant domains; correct answers score, wrong answers cost and declining is neutral. Omniscience Index from −100 to 100." },
	{ id: "aa-omniscience-v1-1-accuracy", name: "AA-Omniscience v1.1 accuracy", page: ev("omniscience"), category: "hallucinations", dataset: "evals", scale: "share", higherIsBetter: true, read: (row) => num(at(row, "omniscienceBreakdown", "accuracy")), description: "Share of AA-Omniscience v1.1 questions answered correctly." },
	{ id: "aa-omniscience-v1-1-hallucination-rate", name: "AA-Omniscience v1.1 hallucination rate", page: ev("omniscience"), category: "hallucinations", dataset: "evals", scale: "share", higherIsBetter: false, read: (row) => num(at(row, "omniscienceBreakdown", "hallucinationRate")), description: "How often the model gives a wrong answer on AA-Omniscience v1.1 questions it doesn't get right, rather than declining. Lower is better." },
	...OMNISCIENCE_DOMAINS.map(([domain, slug]): Measure => ({ id: `aa-omniscience-v1-1-${slug}`, name: `AA-Omniscience v1.1: ${domain}`, page: ev("omniscience"), category: "hallucinations", dataset: "evals", scale: "number", higherIsBetter: true, read: (row) => num(at(row, "omniscienceBreakdown", "byDomain", domain)), description: `AA-Omniscience v1.1 questions in ${domain}. Omniscience Index from −100 to 100 for this domain.` })),
	// Openness and personality
	{ id: "aa-openness-index", name: "Artificial Analysis Openness Index", page: ev("artificial-analysis-openness-index"), category: "general", dataset: "evals", scale: "number", higherIsBetter: true, read: field("opennessIndex"), description: "How open a model is: availability of its weights and transparency about its methodology and pre- and post-training data. Index score out of 100." },
	...PERSONALITY_INDEXES.map(([key, label, about]): Measure => ({ id: `aa-personalitybench-${key}`, name: `AA-PersonalityBench: ${label}`, page: ev("aa-personalitybench"), category: "communication", dataset: "models", scale: "number", higherIsBetter: key !== "slop", read: (row) => num(at(row, "personalityBench", "indexScores", key)), description: `How strongly the model's answers show ${label.toLowerCase()} (${about}). LLM judges compare answers pairwise per trait; the trait Elo z-scores are averaged and percentile ranked from 1 to 100 across all models evaluated. Describes style, not correctness.` })),
	// Cost, speed and reliability on the lab's own API
	{ id: "aa-intelligence-index-cost-per-task-v5", name: "Artificial Analysis Intelligence Index cost per task", page: ev("artificial-analysis-intelligence-index"), category: "cost", dataset: "models", scale: "number", unit: "USD", higherIsBetter: false, read: (row) => num(at(row, "intelligenceIndexCostPerTask", "cost", "total")), description: "Average cost in US dollars of one task while running the Intelligence Index v5 evaluations. Lower is better." },
	{ id: "aa-intelligence-index-time-per-task-v5", name: "Artificial Analysis Intelligence Index time per task", page: ev("artificial-analysis-intelligence-index"), category: "speed", dataset: "models", scale: "number", unit: "s", higherIsBetter: false, read: field("intelligenceIndexTimePerTask"), description: "Average time in seconds to complete one task while running the Intelligence Index v5 evaluations. Lower is better." },
	{ id: "aa-output-speed", name: "Output speed (Artificial Analysis)", page: `${SITE}/leaderboards/models`, category: "speed", dataset: "models", scale: "number", unit: "tokens/s", higherIsBetter: true, read: firstPartyPerformance((row) => num(at(row, "headline", "outputSpeed"))), description: "Output tokens per second once the first token arrives, measured by Artificial Analysis on the model creator's own API." },
	{ id: "aa-ttft", name: "Time to first token (Artificial Analysis)", page: `${SITE}/leaderboards/models`, category: "speed", dataset: "models", scale: "number", unit: "s", higherIsBetter: false, read: firstPartyPerformance((row) => num(at(row, "headline", "timeToFirstToken"))), description: "Seconds until the first token arrives, measured by Artificial Analysis on the model creator's own API. Lower is better." },
	{ id: "aa-blended-price", name: "Blended price (Artificial Analysis)", page: `${SITE}/leaderboards/models`, category: "cost", dataset: "models", scale: "number", unit: "USD/1M tokens", higherIsBetter: false, read: firstPartyPrice(field("price1mBlended0To3To1")), description: "Price in US dollars per million tokens on the model creator's own API, blending input and output prices 3:1. Lower is better." },
];

const ERROR_RATE: BenchmarkDefinition = {
	id: "aa-endpoint-error-rate",
	name: "Endpoint error rate (Artificial Analysis)",
	url: `${SITE}/leaderboards/providers`,
	category: "reliability",
	type: "percentage",
	higherIsBetter: false,
	unit: "%",
	description: "Share of Artificial Analysis' test requests to the model creator's own API endpoint that returned an error. Lower is better.",
};

export function definitionOf(measure: Measure): BenchmarkDefinition {
	return {
		id: measure.id,
		name: measure.name,
		url: measure.page,
		category: measure.category,
		type: measure.scale === "share" ? "percentage" : "numerical",
		higherIsBetter: measure.higherIsBetter,
		unit: measure.scale === "share" ? "%" : measure.unit,
		description: measure.description,
	};
}

/**
 * "Claude Sonnet 5.5 (Medium, Default Fallback)" → "Claude Sonnet 5.5 (Medium)"; effort comes from the config. A
 * "(Reasoning)" config is the model itself (its "(Non-reasoning)" sibling reads as effort "none").
 */
export function aaLabel(row: AaConfig): { label: string; effort?: string } {
	const label = row.name.replace(/,\s*Default Fallback\)/i, ")").replace(/\s*\((?:Default Fallback|Reasoning)\)\s*$/i, "").trim();
	return { label, effort: row.effort?.slug || undefined };
}

/** `endpoints` is the providers board, used to verify the creator's own endpoint for speed and latency. */
export function parseAaConfigs(rows: AaConfig[], dataset: Measure["dataset"], endpoints: AaEndpoint[] = [], measures: Measure[] = MEASURES): SourceObservation[] {
	const wanted = measures.filter((measure) => measure.dataset === dataset);
	return rows.flatMap((row) => {
		if (typeof row?.id !== "string" || typeof row.name !== "string") return [];
		const { label, effort } = aaLabel(row);
		const creator = creatorEndpoint(row, endpoints);
		return wanted.flatMap((measure) => {
			const raw = measure.read(row, creator);
			const reading = typeof raw === "number" ? { value: raw } : raw;
			if (!reading || !Number.isFinite(reading.value)) return [];
			const factor = measure.scale === "share" ? 100 : 1;
			return [{
				benchmarkId: measure.id,
				label,
				effort,
				value: reading.value * factor,
				ciLow: reading.ciLow !== undefined ? reading.ciLow * factor : undefined,
				ciHigh: reading.ciHigh !== undefined ? reading.ciHigh * factor : undefined,
				note: reading.note,
				url: measure.page,
			}];
		});
	});
}

/** Error rate of the lab's own endpoint behind the config's headline figures, as percentage points (AA publishes a share). */
export function parseAaErrorRates(configs: AaConfig[], endpoints: AaEndpoint[]): SourceObservation[] {
	return configs.flatMap((row) => {
		const creator = creatorEndpoint(row, endpoints);
		const rate = num(creator?.performance?.endpointErrorRate);
		if (!creator || rate === undefined) return [];
		const { label, effort } = aaLabel(row);
		return [{ benchmarkId: ERROR_RATE.id, label, effort, value: rate * 100, note: `measured on ${creator.host?.name}'s API`, url: ERROR_RATE.url }];
	});
}

async function loadDataset(ctx: SourceContext, dataset: Dataset): Promise<unknown> {
	if (!ctx.fetchBytes) throw new Error("Artificial Analysis needs a context that can fetch binary data files.");
	const { path, key } = publicDataManifest(await ctx.fetchText(PAGES[dataset]), OWNER_KEYS[dataset]);
	return decryptPublicData(await ctx.fetchBytes(new URL(path, SITE).href), key);
}

function configsOf(data: unknown, page: string): AaConfig[] {
	const rows = Array.isArray((data as { models?: unknown })?.models) ? (data as { models: AaConfig[] }).models : null;
	if (!rows?.length) throw new Error(`Artificial Analysis data for ${page} has no models[]; the format may have changed.`);
	return rows;
}

export const artificialAnalysis: BenchmarkSource = {
	id: "artificial-analysis",
	name: "Artificial Analysis evaluations",
	publisher: "Artificial Analysis",
	url: `${SITE}/evaluations`,
	attribution: "Artificial Analysis (artificialanalysis.ai)",
	minRows: 7900,
	benchmarks: [...MEASURES.map(definitionOf), ERROR_RATE],
	async fetch(ctx) {
		const [evals, models, endpoints] = await Promise.all([loadDataset(ctx, "evals"), loadDataset(ctx, "models"), loadDataset(ctx, "endpoints")]);
		if (!Array.isArray(endpoints) || !endpoints.length) throw new Error("Artificial Analysis providers data is not a list of endpoints; the format may have changed.");
		const modelRows = configsOf(models, PAGES.models);
		return [
			...parseAaConfigs(configsOf(evals, PAGES.evals), "evals"),
			...parseAaConfigs(modelRows, "models", endpoints as AaEndpoint[]),
			...parseAaErrorRates(modelRows, endpoints as AaEndpoint[]),
		];
	},
};
