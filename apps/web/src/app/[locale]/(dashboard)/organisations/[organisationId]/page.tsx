import OrganisationPageContent from "@/components/(data)/organisation/OrganisationOverview";
import { fetchFrontendOrganisation } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import Image from "next/image";
import OrganisationDetailShell from "@/components/(data)/organisation/OrganisationDetailShell";
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { notFound } from "next/navigation";

async function fetchOrganisation(organisationId: string) {
	try {
		return await fetchFrontendOrganisation(organisationId, 12);
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
	const path = `/organisations/${organisationId}`;
	const imagePath = `/og/organisations/${organisationId}`;

	// Fallback SEO if the organisation can't be loaded
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
		t("metadataDetailDescription", { name: organisation.name }),
		organisation.description?.slice(0, 180) ?? undefined,
	]
		.filter(Boolean)
		.join(" ");

	const keywords = [organisation.name, t("keywordAiModels"), t("keywordAiGateway"), "Phaseo"];

	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: path,
		title: t("metadataDetailTitle", { name: organisation.name }),
		description,
		keywords,
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ organisationId: string }>;
}) {
	const t = await getTranslations("Catalogue.organisations");
	const tNav = await getTranslations("Common.nav");
	const { organisationId } = await params;

	const organisation = await fetchFrontendOrganisation(organisationId, 12).catch(() => null);

	// Generate structured data for the organisation page.
	const generateStructuredData = () => {
		if (!organisation) return null;

		const orgName = organisation.name || t("title");
		const description = organisation.description || t("metadataDetailDescription", { name: orgName });

		// Organization Schema
		const organizationSchema = {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": orgName,
			"description": description,
			"url": absoluteUrl(`/organisations/${organisationId}`),
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": tNav("home"),
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": t("title"),
					"item": absoluteUrl("/organisations"),
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": orgName,
					"item": absoluteUrl(`/organisations/${organisationId}`),
				},
			],
		};

		return { organizationSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	if (!organisation) {
		notFound();
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">🏢</span>
						</div>
						<p className="text-base font-medium">
							{t("unknownLabTitle")}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("unknownLabDescription")}
						</p>
						<div className="mt-3">
							<a
								href="https://github.com/phaseoteam/Phaseo/issues/new"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
							>
								{t("contributeGitHub")}
								<Image
									src="/social/github_light.svg"
									alt={t("githubLogoAlt")}
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt={t("githubLogoAlt")}
									width={16}
									height={16}
									className="hidden dark:inline"
								/>
							</a>
						</div>
					</div>
				</div>
			</main>
		);
	}

	// console.log("Latest Models:", organisation.recent_models);

	return (
		<>
			{structuredData && (
				<>
					<JsonLdScript id="organisation-org-schema" data={structuredData.organizationSchema} />
					<JsonLdScript id="organisation-breadcrumb-schema" data={structuredData.breadcrumbSchema} />
				</>
			)}
			<OrganisationDetailShell
				organisationId={organisationId}
				tocItems={[
					...(organisation.description
						? [{ id: "about", label: t("aboutHeading", { name: organisation.name }) }]
						: []),
					{ id: "performance", label: t("performanceTitle") },
					{ id: "latest-models", label: t("latestModelsTitle") },
					...(organisation.organisation_links?.length
						? [{ id: "links", label: t("aroundWebTitle") }]
						: []),
				]}
			>
				<OrganisationPageContent organisation={organisation} />
			</OrganisationDetailShell>
		</>
	);
}
