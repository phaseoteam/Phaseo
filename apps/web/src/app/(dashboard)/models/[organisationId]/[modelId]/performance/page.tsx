import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPerformanceDashboard from "@/components/(data)/models/ModelPerformanceDashboard";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getModelPerformanceMetricsCached } from "@/lib/fetchers/models/getModelPerformance";
import { getModelTokenTrajectoryCached } from "@/lib/fetchers/models/getModelTokenTrajectory";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { Suspense } from "react";
import { cacheLife } from "next/cache";

async function fetchModelOverview(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for metadata", {
			modelId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModelOverview(modelId, includeHidden);
	const path = `/models/${modelId}/performance`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Performance Overview",
			description:
				"Track performance metrics and historical usage for AI models on AI Stats.",
			path,
			keywords: ["AI model performance", "AI metrics", "AI Stats"],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} performance metrics by ${organisationName} on AI Stats.`,
		"See latency, token trajectory, and other runtime signals over time.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Performance - Latency & Token Trajectory`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} performance`,
			`${organisationName} AI`,
			"latency metrics",
			"token usage",
			"AI Stats",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	"use cache";
	cacheLife({
		// Performance dashboards should be near real-time.
		stale: 60 * 60,
		revalidate: 60 * 60,
		expire: 60 * 60 * 24,
	});

	const routeParams = await params;
	const modelId = getModelIdFromParams(routeParams);
	const includeHidden = false;

	console.log(`[perf] modelId=${modelId}`);

	const performanceMetricsPromise = getModelPerformanceMetricsCached(
		modelId,
		includeHidden,
		24
	);
	const tokenTrajectoryPromise = getModelTokenTrajectoryCached(modelId, includeHidden);

	return (
		<ModelDetailShell modelId={modelId} tab="performance" includeHidden={includeHidden}>
			<Suspense fallback={<PerformanceSkeleton />}>
				<PerformancePanel
					metricsPromise={performanceMetricsPromise}
					tokenTrajectoryPromise={tokenTrajectoryPromise}
				/>
			</Suspense>
		</ModelDetailShell>
	);
}

async function PerformancePanel({
	metricsPromise,
	tokenTrajectoryPromise,
}: {
	metricsPromise: ReturnType<typeof getModelPerformanceMetricsCached>;
	tokenTrajectoryPromise: ReturnType<typeof getModelTokenTrajectoryCached>;
}) {
	const [metrics, tokenTrajectory] = await Promise.all([
		metricsPromise,
		tokenTrajectoryPromise,
	]);

	return (
		<ModelPerformanceDashboard
			metrics={metrics}
			tokenTrajectory={tokenTrajectory}
		/>
	);
}

function PerformanceSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-6 w-48 animate-pulse rounded bg-muted" />
			<div className="grid gap-4 md:grid-cols-2">
				<div className="h-40 animate-pulse rounded bg-muted" />
				<div className="h-40 animate-pulse rounded bg-muted" />
			</div>
			<div className="h-72 animate-pulse rounded bg-muted" />
			<div className="h-72 animate-pulse rounded bg-muted" />
		</div>
	);
}
