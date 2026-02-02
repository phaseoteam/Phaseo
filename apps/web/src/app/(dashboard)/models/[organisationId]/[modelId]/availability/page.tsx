import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import { getModelAvailabilityCached } from "@/lib/fetchers/models/getModelAvailability";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";
import ModelAvailability from "@/components/(data)/model/ModelAvailability";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
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
	const includeHidden = await resolveIncludeHidden();
	const model = await fetchModel(modelId, includeHidden);
	const path = `/models/${modelId}/availability`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Availability Overview",
			description:
				"Browse AI model availability on AI Stats, including which providers expose each model and how to access them.",
			path,
			keywords: [
				"AI model availability",
				"AI providers",
				"AI access",
				"AI subscription",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} availability by ${organisationName} on AI Stats.`,
		"See which providers offer this model and how you can access it through their APIs or platforms.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Availability - Providers & Subscription Plan Access`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} availability`,
			`${model.name} providers`,
			`${model.name} access`,
			`${organisationName} AI`,
			"AI Stats",
			"AI model availability",
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

	// Resolve includeHidden outside of cached functions to avoid using cookies() in cache scope
	const includeHidden = await resolveIncludeHidden();

	const model = await getModelOverviewCached(modelId, includeHidden);
	const availability = await getModelAvailabilityCached(modelId, includeHidden);
	const subscriptionPlans = await getModelSubscriptionPlansCached(modelId, includeHidden);

	return (
		<ModelDetailShell modelId={modelId} tab="availability" includeHidden={includeHidden}>
			<ModelAvailability
				availability={availability}
				subscriptionPlans={subscriptionPlans}
				model={model}
			/>
		</ModelDetailShell>
	);
}
