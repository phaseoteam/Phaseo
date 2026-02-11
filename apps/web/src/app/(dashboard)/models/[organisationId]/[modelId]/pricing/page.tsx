import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getModelOverview } from "@/lib/fetchers/models/getModel";
import ModelPricing from "@/components/(data)/model/pricing/ModelPricing";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverview(modelId, includeHidden);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : typeof error === "string" ? error : "";
		const isAbort =
			(error instanceof DOMException && error.name === "AbortError") ||
			message.includes("AbortError");
		if (!isAbort) {
			console.warn("[seo] failed to load model overview for metadata", {
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
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);
	const path = `/models/${modelId}/pricing`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Pricing Overview",
			description:
				"View AI model pricing on AI Stats, including token costs, tiers, and billing details.",
			path,
			keywords: [
				"AI model pricing",
				"token costs",
				"AI billing",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} pricing by ${organisationName} on AI Stats.`,
		"See token costs, endpoints, and billing details for this model.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Pricing - Token Costs & Billing Details`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} pricing`,
			`${organisationName} AI`,
			"token pricing",
			"AI billing",
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
	const routeParams = await params;
	const modelId = getModelIdFromParams(routeParams);
	const includeHidden = false;

	return (
		<ModelDetailShell modelId={modelId} tab="pricing" includeHidden={includeHidden}>
			<ModelPricing modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
