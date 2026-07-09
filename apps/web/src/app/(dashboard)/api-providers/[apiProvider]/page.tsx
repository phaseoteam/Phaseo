import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import ProviderTokenUsageChart from "@/components/(data)/api-providers/Gateway/ProviderTokenUsageChart";
import PerformanceCards from "@/components/(data)/api-providers/Gateway/PerformanceCards";
import { fetchFrontendAPIProviderHeader } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import Script from "next/script";

async function fetchProviderMeta(apiProviderId: string) {
	try {
		return await fetchFrontendAPIProviderHeader(apiProviderId);
	} catch (error) {
		console.warn("[seo] failed to load api provider metadata", {
			apiProviderId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ apiProvider: string }>;
}): Promise<Metadata> {
	const { apiProvider } = await props.params;
	const header = await fetchProviderMeta(apiProvider);
	const imagePath = `/og/api-providers/${apiProvider}`;

	// Fallback: provider not found / fetch failed
	if (!header) {
		return buildMetadata({
			title: "AI API Provider Performance Analytics",
			description:
				"Inspect AI API provider performance on Phaseo with latency, throughput, and reliability metrics from real gateway traffic, plus model usage trends and provider-level rankings.",
			path: `/api-providers/${apiProvider}`,
			keywords: [
				"AI API provider",
				"API performance",
				"latency monitoring",
				"throughput metrics",
				"gateway analytics",
				"Phaseo",
			],
			imagePath,
			imageAlt: "Phaseo API provider insights",
			openGraph: {
				type: "website",
			},
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";

	const description = [
		`${providerName} on Phaseo - real-world performance analytics from the Phaseo Gateway.`,
		"Review token usage trends, latency, throughput, and average generation time, plus which apps and models drive this provider's traffic.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${providerName} - API performance, Latency & Usage analytics`,
		description,
		path: `/api-providers/${apiProvider}`,
		keywords: [
			providerName,
			`${providerName} API`,
			`${providerName} performance`,
			"AI API provider",
			"API latency metrics",
			"gateway analytics",
			"Phaseo",
		],
		imagePath,
		imageAlt: `${providerName} gateway analytics on Phaseo`,
		openGraph: {
			type: "website",
		},
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const resolved = await params;
	const apiProvider = resolved.apiProvider;
	const header = await fetchProviderMeta(apiProvider);

	// Generate structured data and FAQs for SEO
	const generateStructuredData = () => {
		if (!header) return null;

		const providerName = header.api_provider_name || "API Provider";

		// Organization Schema
		const organizationSchema = {
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": providerName,
			"description": `${providerName} is an AI API provider tracked on Phaseo. View real-world performance analytics, latency metrics, throughput data, and popular models.`,
		};

		// FAQ Schema
		const faqSchema = {
			"@context": "https://schema.org",
			"@type": "FAQPage",
			"mainEntity": [
				{
					"@type": "Question",
					"name": `What is ${providerName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${providerName} is an AI API provider that offers access to various AI models. On Phaseo, you can view real-world performance metrics captured by the Phaseo Gateway, including latency, throughput, and reliability data.`,
					},
				},
				{
					"@type": "Question",
					"name": `How is ${providerName} performance measured?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${providerName} performance is measured using real-world data from the Phaseo Gateway. We track metrics including average latency (time to first token and total generation time), throughput (tokens per second), request success rates, and API reliability across different models and endpoints.`,
					},
				},
				{
					"@type": "Question",
					"name": `What models are available on ${providerName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${providerName} offers various AI models across different modalities. Check the Top Models section on Phaseo to see which models are most popular, their performance characteristics, and usage statistics. You can also compare models across different providers.`,
					},
				},
				{
					"@type": "Question",
					"name": `How does ${providerName} compare to other providers?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `Compare ${providerName} against other AI API providers on Phaseo by viewing side-by-side performance metrics, pricing data, model availability, and real-world usage statistics. Use our comparison tools to find the best provider for your specific use case.`,
					},
				},
				{
					"@type": "Question",
					"name": `What apps use ${providerName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `See which applications and services rely on ${providerName} in the Top Apps section on Phaseo. We track real-world usage patterns to show you how developers are integrating ${providerName} into their products.`,
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
					"name": "API Providers",
					"item": absoluteUrl("/api-providers"),
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": providerName,
					"item": absoluteUrl(`/api-providers/${apiProvider}`),
				},
			],
		};

		return { organizationSchema, faqSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	return (
		<>
			{structuredData && (
				<>
					<Script
						id="provider-org-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.organizationSchema),
						}}
					/>
					<Script
						id="provider-faq-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.faqSchema),
						}}
					/>
					<Script
						id="provider-breadcrumb-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.breadcrumbSchema),
						}}
					/>
				</>
			)}
			<APIProviderDetailShell apiProviderId={apiProvider}>
				<div className="flex flex-col gap-10 w-full">
					<section className="space-y-2">
						<h3 className="text-xl font-semibold">Performance</h3>
						<PerformanceCards params={params} />
					</section>

					<ProviderTokenUsageChart apiProviderId={apiProvider} />
				</div>
			</APIProviderDetailShell>
		</>
	);
}
