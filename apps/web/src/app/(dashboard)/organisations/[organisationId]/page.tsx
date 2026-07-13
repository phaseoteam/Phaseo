import OrganisationPageContent from "@/components/(data)/organisation/OrganisationOverview";
import { fetchFrontendOrganisation } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import Image from "next/image";
import OrganisationDetailShell from "@/components/(data)/organisation/OrganisationDetailShell";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import Script from "next/script";

async function fetchOrganisation(organisationId: string) {
	try {
		return await fetchFrontendOrganisation(organisationId, 12);
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
	const organisation = await fetchOrganisation(organisationId);
	const path = `/organisations/${organisationId}`;
	const imagePath = `/og/organisations/${organisationId}`;

	// Fallback SEO if the organisation can't be loaded
	if (!organisation) {
		return buildMetadata({
			title: "AI Organisation Overview",
			description:
				"Discover AI organisations, their latest models, and gateway availability with profile-level insights, release timelines, and ecosystem context across the Phaseo directory.",
			path,
			keywords: [
				"AI organisation",
				"AI provider",
				"AI models",
				"Phaseo",
			],
			imagePath,
		});
	}

	const launchedModels = organisation.recent_models?.length ?? 0;

	const description = [
		`${organisation.name} on Phaseo - organisation overview, AI models, and gateway coverage.`,
		organisation.description?.slice(0, 180) ?? undefined,
		launchedModels
			? `Explore ${launchedModels} recent models, gateway availability, and pricing coverage.`
			: undefined,
	]
		.filter(Boolean)
		.join(" ");

	const keywords = [
		organisation.name,
		`${organisation.name} AI`,
		`${organisation.name} AI organisation`,
		"AI organisation",
		"AI models",
		"AI gateway",
		"Phaseo",
	];

	return buildMetadata({
		title: `${organisation.name} Models`,
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

	const organisation = await fetchFrontendOrganisation(organisationId, 12);

	// Generate structured data and FAQs for SEO
	const generateStructuredData = () => {
		if (!organisation) return null;

		const orgName = organisation.name || "AI Organization";
		const modelCount = organisation.recent_models?.length || 0;
		const description = organisation.description || `${orgName} is an AI organization tracked on Phaseo.`;

		// Organization Schema
		const organizationSchema = {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": orgName,
			"description": description,
			"url": absoluteUrl(`/organisations/${organisationId}`),
		};

		// FAQ Schema
		const faqSchema = {
			"@context": "https://schema.org",
			"@type": "FAQPage",
			"mainEntity": [
				{
					"@type": "Question",
					"name": `What is ${orgName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${orgName} is an AI organization tracked on Phaseo. ${description} You can view their models, gateway availability, pricing information, and latest releases on Phaseo.`,
					},
				},
				{
					"@type": "Question",
					"name": `What models does ${orgName} offer?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": modelCount
							? `${orgName} has ${modelCount} models tracked on Phaseo. View the complete model catalog, compare benchmarks, check pricing across providers, and see API availability for each model.`
							: `${orgName} models are tracked on Phaseo. Check the organization page for their complete model catalog, benchmarks, pricing, and API availability.`,
					},
				},
				{
					"@type": "Question",
					"name": `How do I access ${orgName} models?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${orgName} models can be accessed through various API providers and gateways. Visit the organization page on Phaseo to see which providers offer ${orgName} models, compare pricing, and view API documentation links.`,
					},
				},
				{
					"@type": "Question",
					"name": `What are the latest models from ${orgName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `See the latest model releases from ${orgName} on Phaseo. We track new model launches, updates, and version releases. Check the Recent Models section for the newest additions to ${orgName}'s lineup.`,
					},
				},
				{
					"@type": "Question",
					"name": `How does ${orgName} pricing compare to other providers?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `Compare ${orgName} pricing against other AI organizations on Phaseo. View detailed token pricing, calculate costs with our pricing calculator, and see real-world pricing data across different API providers and deployment options.`,
					},
				},
			],
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": "Home",
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "Organizations",
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

		return { organizationSchema, faqSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	if (!organisation) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">🏢</span>
						</div>
						<p className="text-base font-medium">
							Organisation not found
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							We&apos;re continuously adding new organisations.
							Got one to suggest?
						</p>
						<div className="mt-3">
							<a
								href="https://github.com/phaseoteam/Phaseo/issues/new"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
							>
								Suggest a Model
								<Image
									src="/social/github_light.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt="GitHub Logo"
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
					<Script
						id="organisation-org-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.organizationSchema),
						}}
					/>
					<Script
						id="organisation-faq-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.faqSchema),
						}}
					/>
					<Script
						id="organisation-breadcrumb-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.breadcrumbSchema),
						}}
					/>
				</>
			)}
			<OrganisationDetailShell organisationId={organisationId}>
				<OrganisationPageContent organisation={organisation} />
			</OrganisationDetailShell>
		</>
	);
}
