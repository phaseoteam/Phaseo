import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelAppsSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for apps metadata", {
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
	const includeHidden = false;
	const { canonicalModelId: modelId } = await resolveModelRouteIds(
		params,
		includeHidden,
	);
	const model = await fetchModel(modelId, includeHidden);
	const path = getModelPath(modelId, "apps");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Apps and Distribution",
			description:
				"See where this model is available across apps and subscription plans on AI Stats, including plan-level pricing context and provider coverage.",
			path,
			keywords: ["AI model apps", "subscription plans", "AI distribution", "AI Stats"],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";
	const description = [
		`${model.name} app and plan availability by ${organisationName} on AI Stats.`,
		"Review where this model ships across products and subscription tiers.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Apps - Product and Plan Availability`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} apps`,
			`${model.name} subscription plans`,
			`${organisationName} AI`,
			"AI app availability",
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
	const includeHidden = false;
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId, "apps"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="apps" includeHidden={includeHidden}>
			<ModelAppsSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
