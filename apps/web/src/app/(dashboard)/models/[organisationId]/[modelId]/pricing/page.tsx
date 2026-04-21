import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPricingInsightsSection from "@/components/(data)/model/pricing/ModelPricingInsightsSection";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "pricing");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Pricing - Effective Cost & History`,
		description:
			`${modelName} pricing on AI Stats. Track weighted effective input/output pricing and 30-day pricing history by provider and meter.`,
		path,
		keywords: [
			modelName,
			`${modelName} pricing`,
			`${modelName} effective pricing`,
			`${modelName} pricing history`,
			organisationName ? `${organisationName} AI` : null,
			"token pricing",
			"AI billing",
			"AI Stats",
		].filter(Boolean) as string[],
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
