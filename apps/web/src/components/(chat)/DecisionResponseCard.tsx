import { ChevronDown } from "lucide-react";

type RecordValue = Record<string, unknown>;

type DecisionAnswer = {
	type: string;
	choice?: string;
	score?: number;
	noul?: number;
	confidence?: number;
	legend?: Record<string, string>;
	probabilities?: Record<string, number>;
};

type DecisionResult = {
	model?: string;
	answers: Record<string, DecisionAnswer>;
	requestId?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	totalCostUsd?: string;
	provider?: string;
	latencyMs?: number;
	generationMs?: number;
	endToEndMs?: number;
	throughputTps?: number;
	outputSpeedTps?: number;
};

export type DecisionResponseMetadata = {
	costLabel: string | null;
	endToEndDisplay: string | null;
	endToEndMs: number | null;
	generationMs: number | null;
	latencyMs: number | null;
	metadataProviderId: string | null;
	metadataProviderLabel: string | null;
	inputTokens: number | null;
	outputSpeedTps: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	throughputTps: number | null;
};

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function formatLabel(value: string): string {
	return value
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPercent(value: number | undefined): string {
	if (value === undefined) return "-";
	const percent = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10;
	return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function formatDecimal(value: number | undefined): string {
	if (value === undefined) return "-";
	return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatUsd(value: string | undefined): string | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return `$${value}`;
	if (parsed === 0) return "$0.00";
	if (Math.abs(parsed) < 0.01) return `$${parsed.toFixed(8)}`;
	return `$${parsed.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function parseDecisionResult(value: unknown): DecisionResult | null {
	if (!isRecord(value) || !isRecord(value.answers)) return null;

	const answers = Object.fromEntries(
		Object.entries(value.answers).flatMap(([key, rawAnswer]) => {
			if (!isRecord(rawAnswer)) return [];
			const probabilities = isRecord(rawAnswer.probabilities)
				? Object.fromEntries(
						Object.entries(rawAnswer.probabilities).flatMap(
							([option, probability]) => {
								const parsedProbability = asFiniteNumber(probability);
								return parsedProbability === undefined
									? []
									: [[option, parsedProbability]];
							},
						),
					)
				: undefined;
			const legend = isRecord(rawAnswer.legend)
				? Object.fromEntries(
						Object.entries(rawAnswer.legend).flatMap(([option, description]) => {
							const parsedDescription = asString(description);
							return parsedDescription === undefined
								? []
								: [[option, parsedDescription]];
						}),
					)
				: undefined;
			return [
				[
					key,
					{
						type: asString(rawAnswer.type) ?? "decision",
						choice: asString(rawAnswer.choice),
						score: asFiniteNumber(rawAnswer.score),
						noul: asFiniteNumber(rawAnswer.noul),
						confidence: asFiniteNumber(rawAnswer.confidence),
						legend,
						probabilities,
					},
				],
			] as const;
		}),
	) as Record<string, DecisionAnswer>;

	const usage = isRecord(value.usage) ? value.usage : undefined;
	const pricingBreakdown =
		usage && isRecord(usage.pricing_breakdown)
			? usage.pricing_breakdown
			: undefined;
	const costNanos = asFiniteNumber(value.cost_nanos);
	const totalCostUsd =
		asString(pricingBreakdown?.total_usd_str) ??
		(costNanos === undefined ? undefined : (costNanos / 1_000_000_000).toFixed(8));
	const meta = isRecord(value.meta) ? value.meta : undefined;
	const routing = meta && isRecord(meta.routing) ? meta.routing : undefined;

	return {
		model: asString(value.model),
		answers,
		requestId: asString(value.request_id),
		inputTokens: asFiniteNumber(usage?.input_tokens),
		outputTokens: asFiniteNumber(usage?.output_tokens),
		totalTokens: asFiniteNumber(usage?.total_tokens),
		totalCostUsd,
		provider: asString(routing?.selected_provider),
		latencyMs: asFiniteNumber(meta?.latency_ms),
		generationMs: asFiniteNumber(meta?.generation_ms),
		endToEndMs: asFiniteNumber(meta?.end_to_end_ms),
		throughputTps: asFiniteNumber(meta?.throughput_tps),
		outputSpeedTps: asFiniteNumber(meta?.output_speed_tps),
	};
}

export function getDecisionResponseMetadata(
	result: unknown,
): DecisionResponseMetadata {
	const parsedResult = parseDecisionResult(result);
	const endToEndMs = parsedResult?.endToEndMs ?? null;
	return {
		costLabel: parsedResult ? formatUsd(parsedResult.totalCostUsd) : null,
		endToEndDisplay:
			endToEndMs === null ? null : `${Math.max(0, Math.round(endToEndMs))} ms`,
		endToEndMs,
		generationMs: parsedResult?.generationMs ?? null,
		latencyMs: parsedResult?.latencyMs ?? null,
		metadataProviderId: parsedResult?.provider ?? null,
		metadataProviderLabel: parsedResult?.provider
			? formatLabel(parsedResult.provider)
			: null,
		inputTokens: parsedResult?.inputTokens ?? null,
		outputSpeedTps: parsedResult?.outputSpeedTps ?? null,
		outputTokens: parsedResult?.outputTokens ?? null,
		totalTokens: parsedResult?.totalTokens ?? null,
		throughputTps: parsedResult?.throughputTps ?? null,
	};
}

function normalizeScoreLevelLabel(value: string): string {
	const normalized = value.replace(/^\s*\d+(?:\.\d+)?\s*=\s*/, "").trim();
	return normalized || value;
}

function scoreLevelLabel(answer: DecisionAnswer, option: string): string {
	const label = answer.legend?.[option];
	return label ? normalizeScoreLevelLabel(label) : `Score ${option}`;
}

function dominantScoreOption(
	answer: DecisionAnswer,
	probabilities: Array<[string, number]>,
): string | undefined {
	if (probabilities.length > 0) {
		return probabilities.reduce((best, current) =>
			current[1] > best[1] ? current : best,
		)[0];
	}
	if (answer.score === undefined) return undefined;
	const numericOptions = Object.keys(answer.legend ?? {})
		.map((option) => ({ option, value: Number(option) }))
		.filter(({ value }) => Number.isFinite(value));
	if (numericOptions.length === 0) return undefined;
	return numericOptions.reduce((best, current) =>
		Math.abs(current.value - (answer.score ?? 0)) <
		Math.abs(best.value - (answer.score ?? 0))
			? current
			: best,
	).option;
}

function answerValue(
	answer: DecisionAnswer,
	probabilities: Array<[string, number]>,
): string {
	if (answer.type === "choice") return formatLabel(answer.choice ?? "No choice");
	if (answer.type === "score") {
		const option = dominantScoreOption(answer, probabilities);
		return option ? scoreLevelLabel(answer, option) : "Score";
	}
	if (answer.type === "noul") {
		return answer.noul !== undefined && answer.noul >= 0.5 ? "Yes" : "No";
	}
	return answer.choice ? formatLabel(answer.choice) : formatDecimal(answer.score);
}

function probabilityEntries(answer: DecisionAnswer): Array<[string, number]> {
	return Object.entries(answer.probabilities ?? {}).sort(
		([leftOption, leftProbability], [rightOption, rightProbability]) => {
			if (answer.type === "score") {
				return Number(leftOption) - Number(rightOption);
			}
			return rightProbability - leftProbability;
		},
	);
}

function noulProbabilityEntries(answer: DecisionAnswer): Array<[string, number]> {
	const yes = Math.max(0, Math.min(1, answer.noul ?? 0));
	return [
		["Yes", yes],
		["No", 1 - yes],
	];
}

const probabilityColors = [
	"bg-chart-2",
	"bg-chart-4",
	"bg-chart-1",
	"bg-chart-5",
	"bg-chart-3",
];

function ProbabilityStrip({ entries }: { entries: Array<[string, number]> }) {
	const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
	return (
		<div
			className="flex h-2 overflow-hidden rounded-full bg-muted"
			role="img"
			aria-label={entries
				.map(([label, probability]) => `${label}: ${formatPercent(probability)}`)
				.join(", ")}
		>
			{entries.map(([label, probability], index) => (
				<div
					key={`${label}-${index}`}
					className={`${probabilityColors[index % probabilityColors.length]} transition-[width]`}
					style={{
						width: `${total > 0 ? (Math.max(0, probability) / total) * 100 : 0}%`,
					}}
				/>
			))}
		</div>
	);
}

function ProbabilityRows({
	answer,
	entries,
}: {
	answer: DecisionAnswer;
	entries: Array<[string, number]>;
}) {
	return (
		<div className="space-y-2.5">
			{entries.map(([option, probability], index) => {
				const isScore = answer.type === "score";
				const description = isScore ? undefined : answer.legend?.[option];
				const label = isScore
					? scoreLevelLabel(answer, option)
					: formatLabel(option);
				return (
					<div key={option} className="space-y-1">
						<div className="flex items-start justify-between gap-3 text-xs">
							<div className="min-w-0">
								<div className="flex items-center gap-1.5">
									<span
										className={`size-2 shrink-0 rounded-full ${probabilityColors[index % probabilityColors.length]}`}
									/>
									<span className="truncate font-medium text-foreground">
										{label}
									</span>
								</div>
								{description ? (
									<span className="mt-0.5 block truncate pl-3.5 text-[11px] text-muted-foreground">
										{description}
									</span>
								) : null}
							</div>
							<span className="shrink-0 font-mono tabular-nums text-foreground">
								{formatPercent(probability)}
							</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								className={`h-full rounded-full ${probabilityColors[index % probabilityColors.length]} transition-[width]`}
								style={{
									width: `${Math.max(0, Math.min(1, probability)) * 100}%`,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function DecisionAnswerView({ answer }: { answer: DecisionAnswer }) {
	const isNoul = answer.type === "noul";
	const probabilities = isNoul
		? noulProbabilityEntries(answer)
		: probabilityEntries(answer);
	const confidence = answer.confidence;
	const displayProbabilities =
		answer.type === "score"
			? probabilities.map(([option, probability]) => [
					scoreLevelLabel(answer, option),
					probability,
				] as [string, number])
			: probabilities;
	const scoreOptions = [
		...probabilities.map(([option]) => Number(option)),
		...Object.keys(answer.legend ?? {}).map(Number),
	].filter((option) => Number.isFinite(option));
	const maxScore = scoreOptions.length > 0 ? Math.max(...scoreOptions) : undefined;

	if (isNoul) {
		return (
			<div className="w-full py-1 text-sm leading-relaxed text-foreground">
				<ProbabilityRows answer={answer} entries={probabilities} />
			</div>
		);
	}

	return (
		<div className="w-full space-y-4 py-1 text-sm leading-relaxed text-foreground">
			<div className="flex items-end justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-lg font-semibold tracking-tight text-foreground">
						{answerValue(answer, probabilities)}
					</div>
					{answer.type === "score" && maxScore !== undefined ? (
						<div className="mt-0.5 text-xs text-muted-foreground">
							Weighted average: {formatDecimal(answer.score)} of {maxScore}
						</div>
					) : null}
				</div>
				{confidence !== undefined ? (
					<div className="shrink-0 text-right text-xs text-muted-foreground">
						<div className="font-medium text-foreground">
							{formatPercent(confidence)}
						</div>
						confidence
					</div>
				) : null}
			</div>

			{probabilities.length > 0 ? (
				<div className="space-y-3">
					<ProbabilityStrip entries={displayProbabilities} />
					<ProbabilityRows answer={answer} entries={probabilities} />
				</div>
			) : null}
		</div>
	);
}

function RawResponseFallback({ result }: { result: unknown }) {
	return (
		<details className="w-full max-w-[min(100%,46rem)]">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
				<span>View response</span>
				<ChevronDown className="size-4 text-muted-foreground" />
			</summary>
			<pre className="mt-2 max-h-96 overflow-auto border-l border-border pl-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
				{result === null || result === undefined
					? "No decision output returned."
					: JSON.stringify(result, null, 2)}
			</pre>
		</details>
	);
}

export function DecisionResponseCard({ result }: { result: unknown }) {
	const parsedResult = parseDecisionResult(result);
	if (!parsedResult) return <RawResponseFallback result={result} />;

	const answerEntries = Object.entries(parsedResult.answers);
	return (
		<div className="w-full max-w-[min(100%,46rem)]">
			{answerEntries.length > 0 ? (
				<div className="divide-y divide-border/70">
					{answerEntries.map(([name, answer]) => (
						<div key={name} className="py-3 first:pt-0 last:pb-0">
							<DecisionAnswerView answer={answer} />
						</div>
					))}
				</div>
			) : (
				<div className="py-1 text-sm text-muted-foreground">
					No decision output returned.
				</div>
			)}
		</div>
	);
}
