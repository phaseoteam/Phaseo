import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import PerformanceCards from "@/components/(data)/api-providers/Gateway/PerformanceCards";
import TopModels from "@/components/(data)/api-providers/Gateway/TopModels";
import TopApps from "@/components/(data)/api-providers/Gateway/TopApps";
import Updates from "@/components/(data)/api-providers/Gateway/Updates";
import getAPIProviderHeader from "@/lib/fetchers/api-providers/getAPIProviderHeader";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import Script from "next/script";

async function fetchProviderMeta(apiProviderId: string) {
	try {
		return await getAPIProviderHeader(apiProviderId);
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
				"Inspect AI API provider performance on AI Stats. Explore latency, throughput, and reliability metrics captured by the AI Stats Gateway.",
			path: `/api-providers/${apiProvider}`,
			keywords: [
				"AI API provider",
				"API performance",
				"latency monitoring",
				"throughput metrics",
				"gateway analytics",
				"AI Stats",
			],
			imagePath,
			imageAlt: "AI Stats API provider insights",
			openGraph: {
				type: "website",
			},
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";

	const description = [
		`${providerName} on AI Stats - real-world performance analytics from the AI Stats Gateway.`,
		"Review latency, throughput, and average generation time, see which apps rely on this provider most, and track newly added models and integrations.",
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
			"AI Stats",
		],
		imagePath,
		imageAlt: `${providerName} gateway analytics on AI Stats`,
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
			"description": `${providerName} is an AI API provider tracked on AI Stats. View real-world performance analytics, latency metrics, throughput data, and popular models.`,
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
						"text": `${providerName} is an AI API provider that offers access to various AI models. On AI Stats, you can view real-world performance metrics captured by the AI Stats Gateway, including latency, throughput, and reliability data.`,
					},
				},
				{
					"@type": "Question",
					"name": `How is ${providerName} performance measured?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${providerName} performance is measured using real-world data from the AI Stats Gateway. We track metrics including average latency (time to first token and total generation time), throughput (tokens per second), request success rates, and API reliability across different models and endpoints.`,
					},
				},
				{
					"@type": "Question",
					"name": `What models are available on ${providerName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${providerName} offers various AI models across different modalities. Check the Top Models section on AI Stats to see which models are most popular, their performance characteristics, and usage statistics. You can also compare models across different providers.`,
					},
				},
				{
					"@type": "Question",
					"name": `How does ${providerName} compare to other providers?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `Compare ${providerName} against other AI API providers on AI Stats by viewing side-by-side performance metrics, pricing data, model availability, and real-world usage statistics. Use our comparison tools to find the best provider for your specific use case.`,
					},
				},
				{
					"@type": "Question",
					"name": `What apps use ${providerName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `See which applications and services rely on ${providerName} in the Top Apps section on AI Stats. We track real-world usage patterns to show you how developers are integrating ${providerName} into their products.`,
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
					"item": "https://aistats.org",
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "API Providers",
					"item": "https://aistats.org/api-providers",
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": providerName,
					"item": `https://aistats.org/api-providers/${apiProvider}`,
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
				<div className="flex flex-col gap-6 w-full">
					<PerformanceCards params={params} />

					<TopModels count={6} apiProviderId={apiProvider} />

					<TopApps count={20} apiProviderId={apiProvider} period="week" />

					<Updates apiProviderId={apiProvider} />
				</div>
			</APIProviderDetailShell>
		</>
	);
}
