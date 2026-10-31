import ModelsDisplay from "@/components/(data)/organisation/ModelsDisplay";
import OrganisationDetailShell from "@/components/(data)/organisation/OrganisationDetailShell";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { fetchFrontendOrganisation } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { notFound } from "@/lib/navigation";
import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { organisationModelsQuery } from "../page.queries";

async function fetchOrganisation(organisationId: string) {
	try {
		return await fetchFrontendOrganisation(organisationId, 8);
	} catch (error) {
		// eslint-disable-next-line no-console
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
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.organisations");
	const { organisationId } = await props.params;
	const organisation = await fetchOrganisation(organisationId);
	const path = `/organisations/${organisationId}/models`;
	const imagePath = `/og/organisations/${organisationId}`;

	// Fallback if the organisation data can't be loaded
	if (!organisation) {
		return buildLocalizedPageMetadata({
			locale: locale as never,
			pathname: path,
			title: t("title"),
			description: t("description"),
			keywords: [
				t("title"),
				t("keywordAiModels"),
				t("keywordAiGateway"),
				"Phaseo",
			],
			imagePath,
		});
	}

	const description = [
		t("metadataModelsDescription", { name: organisation.name }),
		organisation.description?.slice(0, 180) ?? undefined,
	]
		.filter(Boolean)
		.join(" ");

	const keywords = [organisation.name, t("keywordAiModels"), t("keywordAiGateway"), "Phaseo"];

	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: path,
		title: t("metadataModelsTitle", { name: organisation.name }),
		description,
		keywords,
		imagePath,
	});
}

export default function Page({
	params,
}: {
	params: Promise<{ organisationId: string }>;
}) {
	const { organisationId } = use(params);

	// Unknown organisations 404 in the route loader before rendering.
	const { data: models } = useSuspenseQuery(organisationModelsQuery(organisationId));
	if (!models) notFound();

	return (
		<OrganisationDetailShell organisationId={organisationId} tab="models">
			<ModelsDisplay models={models} showStatusHeadings={true} />
		</OrganisationDetailShell>
	);
}
