import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPricingInsightsSection from "@/components/(data)/model/pricing/ModelPricingInsightsSection";
import { Skeleton } from "@/components/ui/skeleton";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : typeof error === "string" ? error : "";
		const isAbort =
			(error instanceof DOMException && error.name === "AbortError") ||
			message.includes("AbortError");
		if (!isAbort) {
			console.warn("[seo] failed to load model overview for pricing metadata", {
				modelId,
				error,
			});
		}
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const includeHidden = false;
	const { canonicalModelId: modelId } = await resolveModelRouteIds(
		params,
		includeHidden,
	);
	const model = await fetchModel(modelId, includeHidden);
	const path = getModelPath(modelId, "pricing");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Pricing Insights",
			description:
				"View effective pricing and 30-day pricing history for this model across providers.",
			path,
			keywords: [
				"AI model pricing",
				"effective pricing",
				"pricing history",
				"token pricing",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";
	return buildMetadata({
		title: `${model.name} Pricing - Effective Cost & History`,
		description: `${model.name} pricing by ${organisationName} on AI Stats. Track weighted effective input/output pricing and 30-day pricing history by provider and meter.`,
		path,
		keywords: [
			model.name,
			`${model.name} pricing`,
			`${model.name} effective pricing`,
			`${model.name} pricing history`,
			`${organisationName} AI`,
			"token pricing",
			"AI billing",
			"AI Stats",
		],
		imagePath,
	});
}

function PricingInsightsFallback() {
	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="space-y-2">
					<Skeleton className="h-6 w-44" />
					<Skeleton className="h-4 w-full max-w-2xl" />
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<Skeleton className="h-[120px]" />
					<Skeleton className="h-[120px]" />
				</div>
				<Skeleton className="h-[280px]" />
			</section>
			<section className="space-y-4">
				<div className="space-y-2">
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-full max-w-xl" />
				</div>
				<Skeleton className="h-9 w-full max-w-md" />
				<Skeleton className="h-[336px]" />
			</section>
		</div>
	);
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const includeHidden = false;
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId, "pricing"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="pricing" includeHidden={includeHidden}>
			<Suspense fallback={<PricingInsightsFallback />}>
				<ModelPricingInsightsSection
					modelId={modelId}
					includeHidden={includeHidden}
					showPageHeader
				/>
			</Suspense>
		</ModelDetailShell>
	);
}
