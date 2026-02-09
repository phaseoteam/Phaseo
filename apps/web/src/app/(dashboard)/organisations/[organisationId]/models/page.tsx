import { getOrganisationModelsCached } from "@/lib/fetchers/organisations/getOrganisation";
import ModelsDisplay from "@/components/(data)/organisation/ModelsDisplay";
import OrganisationDetailShell from "@/components/(data)/organisation/OrganisationDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getOrganisationDataCached } from "@/lib/fetchers/organisations/getOrganisation";

async function fetchOrganisation(organisationId: string, includeHidden: boolean) {
	try {
		return await getOrganisationDataCached(organisationId, 8, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load organisation metadata", {
			organisationId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ organisationId: string }>;
}): Promise<Metadata> {
	const { organisationId } = await props.params;
	const includeHidden = false;
	const organisation = await fetchOrganisation(organisationId, includeHidden);
	const path = `/organisations/${organisationId}/models`;
	const imagePath = `/og/organisations/${organisationId}`;

	// Fallback if the organisation data can't be loaded
	if (!organisation) {
		return buildMetadata({
			title: "AI Models Overview by Organisation",
			description:
				"Discover AI models from leading organisations and see their gateway availability inside the AI Stats directory.",
			path,
			keywords: [
				"AI models",
				"AI organisation",
				"AI providers",
				"AI Stats",
			],
			imagePath,
		});
	}

	const description = [
		`Explore all AI models from ${organisation.name} on AI Stats.`,
		organisation.description?.slice(0, 180) ?? undefined,
		"View gateway availability, pricing coverage, and model details in one place.",
	]
		.filter(Boolean)
		.join(" ");

	const keywords = [
		organisation.name,
		`${organisation.name} AI models`,
		`${organisation.name} models`,
		"AI models",
		"AI gateway",
		"AI Stats",
	];

	return buildMetadata({
		title: `${organisation.name} Models - Catalogue & Gateway Coverage`,
		description,
		path,
		keywords,
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ organisationId: string }>;
}) {
	const { organisationId } = await params;

	const includeHidden = false;
	const models = await getOrganisationModelsCached(organisationId, includeHidden);

	return (
		<OrganisationDetailShell organisationId={organisationId}>
			<ModelsDisplay models={models} showStatusHeadings={true} />
		</OrganisationDetailShell>
	);
}
