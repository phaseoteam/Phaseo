import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
	ArrowLeft,
	CheckCircle2,
	CircleStop,
	Clock3,
	GitCompareArrows,
	Play,
	XCircle,
} from "lucide-react";
import { updatePresetExperimentStatus } from "@/app/(dashboard)/settings/presets/experiments/actions";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { presetExperimentsEnabled } from "@/lib/flags";

export const metadata: Metadata = {
	title: "Preset Experiment Compare - Settings",
};

type ExperimentRow = {
	id: string;
	preset_id: string | null;
	baseline_preset_id: string | null;
	name: string | null;
	description: string | null;
	status: string;
	dataset_name: string | null;
	config: unknown;
	summary: unknown;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
};

type PresetRow = {
	id: string;
	name: string;
	slug: string | null;
	description: string | null;
	config: unknown;
};

type FeedbackRow = {
	id: string;
	request_id: string | null;
	session_id: string | null;
	preset_id: string | null;
	test_run_id: string | null;
	source: string | null;
	rating: string | null;
	score: number | string | null;
	reason: string | null;
	reason_tags: string[] | null;
	comment: string | null;
	metadata: unknown;
	metadata_dimensions: unknown;
	end_user_id: string | null;
	created_at: string | null;
};

type EventRow = {
	id: string;
	request_id: string | null;
	session_id: string | null;
	preset_id: string | null;
	test_run_id: string | null;
	category: string | null;
	event_name: string | null;
	value: unknown;
	numeric_value: number | string | null;
	metadata: unknown;
	metadata_dimensions: unknown;
	source: string | null;
	occurred_at: string | null;
	created_at: string | null;
};

type VariantKey = "candidate" | "baseline" | "unassigned";

type Summary = {
	count: number;
	positive: number;
	negative: number;
	partial: number;
	scoreSum: number;
	scoreCount: number;
	averageScore: number | null;
	ratings: Record<string, number>;
};

type CohortRow = {
	dimension: string;
	value: string;
	candidate: Summary;
	baseline: Summary;
	unassigned: Summary;
};

function emptySummary(): Summary {
	return {
		count: 0,
		positive: 0,
		negative: 0,
		partial: 0,
		scoreSum: 0,
		scoreCount: 0,
		averageScore: null,
		ratings: {},
	};
}

function addFeedback(summary: Summary, row: FeedbackRow) {
	summary.count += 1;
	const rating = String(row.rating ?? "unrated");
	summary.ratings[rating] = (summary.ratings[rating] ?? 0) + 1;
	if (rating === "thumbs_up" || rating === "correct") summary.positive += 1;
	if (rating === "thumbs_down" || rating === "incorrect" || rating === "unsafe") {
		summary.negative += 1;
	}
	if (rating === "partly_correct") summary.partial += 1;
	const score = Number(row.score);
	if (Number.isFinite(score)) {
		summary.scoreSum += score;
		summary.scoreCount += 1;
		summary.averageScore = summary.scoreSum / summary.scoreCount;
	}
}

function getVariant(row: FeedbackRow | EventRow, experiment: ExperimentRow): VariantKey {
	if (row.preset_id && row.preset_id === experiment.preset_id) return "candidate";
	if (row.preset_id && row.preset_id === experiment.baseline_preset_id) return "baseline";
	return "unassigned";
}

function getDimensions(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
		if (typeof rawValue !== "string") continue;
		out[key] = rawValue;
	}
	return out;
}

function getConfiguredDimensionKeys(config: unknown): string[] {
	if (!config || typeof config !== "object" || Array.isArray(config)) return [];
	const keys = (config as Record<string, unknown>).metadata_dimension_keys;
	if (!Array.isArray(keys)) return [];
	return keys
		.map((key) => (typeof key === "string" ? key.trim() : ""))
		.filter((key) => /^[a-zA-Z0-9_.:-]+$/.test(key))
		.slice(0, 8);
}

function discoverDimensionKeys(rows: FeedbackRow[]): string[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		for (const key of Object.keys(getDimensions(row.metadata_dimensions))) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 6)
		.map(([key]) => key);
}

function buildVariantSummaries(rows: FeedbackRow[], experiment: ExperimentRow) {
	const summaries: Record<VariantKey, Summary> = {
		candidate: emptySummary(),
		baseline: emptySummary(),
		unassigned: emptySummary(),
	};
	for (const row of rows) addFeedback(summaries[getVariant(row, experiment)], row);
	return summaries;
}

function buildCohorts(rows: FeedbackRow[], experiment: ExperimentRow, keys: string[]): CohortRow[] {
	const cohorts = new Map<string, CohortRow>();
	for (const row of rows) {
		const dimensions = getDimensions(row.metadata_dimensions);
		const variant = getVariant(row, experiment);
		for (const key of keys) {
			const value = dimensions[key];
			if (!value) continue;
			const mapKey = `${key}\n${value}`;
			const current = cohorts.get(mapKey) ?? {
				dimension: key,
				value,
				candidate: emptySummary(),
				baseline: emptySummary(),
				unassigned: emptySummary(),
			};
			addFeedback(current[variant], row);
			cohorts.set(mapKey, current);
		}
	}
	return Array.from(cohorts.values())
		.sort((a, b) => {
			const totalB = b.candidate.count + b.baseline.count + b.unassigned.count;
			const totalA = a.candidate.count + a.baseline.count + a.unassigned.count;
			return totalB - totalA || a.dimension.localeCompare(b.dimension);
		})
		.slice(0, 30);
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatScore(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "n/a";
	return `${Math.round(value * 100)}%`;
}

function formatDelta(candidate: number | null, baseline: number | null): string {
	if (candidate === null || baseline === null) return "n/a";
	const delta = Math.round((candidate - baseline) * 100);
	return `${delta > 0 ? "+" : ""}${delta} pp`;
}

function compactJson(value: unknown, maxLength = 120): string {
	if (value === null || value === undefined) return "";
	try {
		const text = JSON.stringify(value);
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
	} catch {
		return "";
	}
}

function StatusButton({
	id,
	status,
	label,
	icon,
	variant = "outline",
}: {
	id: string;
	status: string;
	label: string;
	icon: React.ReactNode;
	variant?: "outline" | "default" | "destructive" | "secondary";
}) {
	return (
		<form action={updatePresetExperimentStatus}>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value={status} />
			<Button type="submit" size="sm" variant={variant}>
				{icon}
				{label}
			</Button>
		</form>
	);
}

async function loadExperiment(runId: string) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) return { workspaceId: null };
	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	const { data: experiment, error: experimentError } = await supabase
		.from("gateway_preset_test_runs")
		.select("*")
		.eq("workspace_id", workspaceId)
		.eq("id", runId)
		.maybeSingle();
	if (experimentError) throw experimentError;
	if (!experiment) return { workspaceId, experiment: null };

	const presetIds = Array.from(
		new Set(
			[
				(experiment as ExperimentRow).preset_id,
				(experiment as ExperimentRow).baseline_preset_id,
			].filter((id): id is string => Boolean(id)),
		),
	);

	const [presetsResult, feedbackResult, eventsResult] = await Promise.all([
		presetIds.length
			? supabase
					.from("presets")
					.select("id,name,slug,description,config")
					.eq("workspace_id", workspaceId)
					.in("id", presetIds)
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from("gateway_feedback")
			.select("*")
			.eq("workspace_id", workspaceId)
			.eq("test_run_id", runId)
			.order("created_at", { ascending: false })
			.limit(5000),
		supabase
			.from("gateway_observability_events")
			.select("*")
			.eq("workspace_id", workspaceId)
			.eq("test_run_id", runId)
			.order("occurred_at", { ascending: false })
			.limit(500),
	]);
	if (presetsResult.error) throw presetsResult.error;
	if (feedbackResult.error) throw feedbackResult.error;
	if (eventsResult.error) throw eventsResult.error;

	return {
		workspaceId,
		experiment: experiment as ExperimentRow,
		presets: (presetsResult.data ?? []) as PresetRow[],
		feedback: (feedbackResult.data ?? []) as FeedbackRow[],
		events: (eventsResult.data ?? []) as EventRow[],
	};
}

export default async function PresetExperimentDetailPage({
	params,
}: {
	params: Promise<{ runId: string }>;
}) {
	if (!(await presetExperimentsEnabled())) notFound();
	const { runId } = await params;
	const data = await loadExperiment(runId).catch((error) => {
		if (String(error?.message ?? "").toLowerCase().includes("unauthorized")) {
			redirect("/sign-in");
		}
		throw error;
	});
	if (!data.workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Preset experiment</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Select a workspace to view this experiment.
					</p>
				</CardContent>
			</Card>
		);
	}
	if (!data.experiment) notFound();

	const experiment = data.experiment;
	const presetById = new Map(data.presets.map((preset) => [preset.id, preset]));
	const candidate = experiment.preset_id ? presetById.get(experiment.preset_id) : null;
	const baseline = experiment.baseline_preset_id
		? presetById.get(experiment.baseline_preset_id)
		: null;
	const summaries = buildVariantSummaries(data.feedback, experiment);
	const dimensionKeys =
		getConfiguredDimensionKeys(experiment.config).length > 0
			? getConfiguredDimensionKeys(experiment.config)
			: discoverDimensionKeys(data.feedback);
	const cohorts = buildCohorts(data.feedback, experiment, dimensionKeys);

	return (
		<div className="space-y-6">
			<div>
				<Button asChild variant="ghost" size="sm" className="mb-3">
					<Link href="/settings/presets/experiments">
						<ArrowLeft className="h-4 w-4" />
						Experiments
					</Link>
				</Button>
				<SettingsPageHeader
					title={experiment.name ?? "Preset experiment"}
					description={experiment.description ?? "Compare feedback and outcome signals across presets."}
					meta={<Badge variant="outline">{experiment.status}</Badge>}
					actions={
						<div className="flex flex-wrap gap-2">
							<StatusButton
								id={experiment.id}
								status="running"
								label="Start"
								icon={<Play className="h-4 w-4" />}
							/>
							<StatusButton
								id={experiment.id}
								status="completed"
								label="Complete"
								icon={<CheckCircle2 className="h-4 w-4" />}
								variant="default"
							/>
							<StatusButton
								id={experiment.id}
								status="failed"
								label="Fail"
								icon={<XCircle className="h-4 w-4" />}
								variant="destructive"
							/>
						</div>
					}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<MetricCard title="Feedback" value={String(data.feedback.length)} detail="linked responses" />
				<MetricCard title="Events" value={String(data.events.length)} detail="outcome signals" />
				<MetricCard title="Candidate score" value={formatScore(summaries.candidate.averageScore)} detail={candidate?.name ?? "Unassigned"} />
				<MetricCard title="Score delta" value={formatDelta(summaries.candidate.averageScore, summaries.baseline.averageScore)} detail={baseline?.name ? `vs ${baseline.name}` : "no baseline"} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<GitCompareArrows className="h-4 w-4" />
						Preset comparison
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Variant</TableHead>
								<TableHead>Preset</TableHead>
								<TableHead className="text-right">Feedback</TableHead>
								<TableHead className="text-right">Avg score</TableHead>
								<TableHead className="text-right">Positive</TableHead>
								<TableHead className="text-right">Partial</TableHead>
								<TableHead className="text-right">Negative</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<CompareRow label="Candidate" preset={candidate} summary={summaries.candidate} />
							<CompareRow label="Baseline" preset={baseline} summary={summaries.baseline} />
							{summaries.unassigned.count > 0 ? (
								<CompareRow label="Unassigned" preset={null} summary={summaries.unassigned} />
							) : null}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Cohort comparison</CardTitle>
					<p className="text-sm text-muted-foreground">
						Indexed metadata dimensions from feedback payloads.
					</p>
				</CardHeader>
				<CardContent>
					{cohorts.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No cohort dimensions have been recorded for this experiment.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Dimension</TableHead>
									<TableHead>Value</TableHead>
									<TableHead className="text-right">Candidate</TableHead>
									<TableHead className="text-right">Baseline</TableHead>
									<TableHead className="text-right">Delta</TableHead>
									<TableHead className="text-right">Feedback</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{cohorts.map((cohort) => (
									<TableRow key={`${cohort.dimension}:${cohort.value}`}>
										<TableCell className="font-mono text-xs">{cohort.dimension}</TableCell>
										<TableCell>{cohort.value}</TableCell>
										<TableCell className="text-right">
											{formatScore(cohort.candidate.averageScore)}
										</TableCell>
										<TableCell className="text-right">
											{formatScore(cohort.baseline.averageScore)}
										</TableCell>
										<TableCell className="text-right">
											{formatDelta(cohort.candidate.averageScore, cohort.baseline.averageScore)}
										</TableCell>
										<TableCell className="text-right">
											{cohort.candidate.count + cohort.baseline.count + cohort.unassigned.count}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Recent feedback</CardTitle>
					</CardHeader>
					<CardContent>
						{data.feedback.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No feedback has been linked to this experiment yet.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Signal</TableHead>
										<TableHead>Variant</TableHead>
										<TableHead>Request</TableHead>
										<TableHead className="text-right">Created</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.feedback.slice(0, 20).map((row) => (
										<TableRow key={row.id}>
											<TableCell>
												<div className="space-y-1">
													<div className="flex flex-wrap items-center gap-2">
														<Badge variant="outline">{row.rating ?? "unrated"}</Badge>
														<span className="text-sm">{formatScore(Number(row.score))}</span>
													</div>
													<p className="line-clamp-2 text-xs text-muted-foreground">
														{row.comment ?? row.reason ?? compactJson(row.metadata_dimensions)}
													</p>
												</div>
											</TableCell>
											<TableCell>{getVariant(row, experiment)}</TableCell>
											<TableCell>
												{row.request_id ? (
													<Link
														href={`/settings/usage/logs/${encodeURIComponent(row.request_id)}`}
														className="font-mono text-xs hover:underline"
													>
														{row.request_id}
													</Link>
												) : (
													<span className="text-muted-foreground">No request</span>
												)}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{formatDate(row.created_at)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Outcome events</CardTitle>
					</CardHeader>
					<CardContent>
						{data.events.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No outcome events have been linked to this experiment yet.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Event</TableHead>
										<TableHead>Variant</TableHead>
										<TableHead className="text-right">Value</TableHead>
										<TableHead className="text-right">Occurred</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.events.slice(0, 20).map((row) => (
										<TableRow key={row.id}>
											<TableCell>
												<div>
													<p className="font-medium">{row.event_name ?? "event"}</p>
													<p className="line-clamp-1 text-xs text-muted-foreground">
														{row.category ?? "custom"} {compactJson(row.metadata_dimensions)}
													</p>
												</div>
											</TableCell>
											<TableCell>{getVariant(row, experiment)}</TableCell>
											<TableCell className="text-right">
												{row.numeric_value == null ? compactJson(row.value, 60) : Number(row.numeric_value)}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{formatDate(row.occurred_at ?? row.created_at)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Run metadata</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
						<MetadataItem icon={<Clock3 className="h-4 w-4" />} label="Created" value={formatDate(experiment.created_at)} />
						<MetadataItem icon={<Play className="h-4 w-4" />} label="Started" value={formatDate(experiment.started_at)} />
						<MetadataItem icon={<CircleStop className="h-4 w-4" />} label="Completed" value={formatDate(experiment.completed_at)} />
						<MetadataItem icon={<GitCompareArrows className="h-4 w-4" />} label="Dataset" value={experiment.dataset_name ?? "Unspecified"} />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
				<p className="mt-2 text-2xl font-semibold">{value}</p>
				<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
			</CardContent>
		</Card>
	);
}

function CompareRow({
	label,
	preset,
	summary,
}: {
	label: string;
	preset: PresetRow | null | undefined;
	summary: Summary;
}) {
	return (
		<TableRow>
			<TableCell>
				<Badge variant={label === "Candidate" ? "default" : "outline"}>{label}</Badge>
			</TableCell>
			<TableCell>
				<div>
					<p className="font-medium">{preset?.name ?? "Unassigned"}</p>
					{preset?.slug ? (
						<p className="font-mono text-xs text-muted-foreground">@{preset.slug}</p>
					) : null}
				</div>
			</TableCell>
			<TableCell className="text-right">{summary.count}</TableCell>
			<TableCell className="text-right">{formatScore(summary.averageScore)}</TableCell>
			<TableCell className="text-right">{summary.positive}</TableCell>
			<TableCell className="text-right">{summary.partial}</TableCell>
			<TableCell className="text-right">{summary.negative}</TableCell>
		</TableRow>
	);
}

function MetadataItem({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border bg-muted/10 px-3 py-2">
			<div className="text-muted-foreground">{icon}</div>
			<div className="min-w-0">
				<p className="text-xs text-muted-foreground">{label}</p>
				<p className="truncate font-medium">{value}</p>
			</div>
		</div>
	);
}
