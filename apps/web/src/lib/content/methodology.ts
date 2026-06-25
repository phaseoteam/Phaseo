export type MethodologySection = {
	heading: string;
	paragraphs: string[];
};

export type MethodologyEntry = {
	path: string;
	slug: string;
	shortTitle: string;
	title: string;
	description: string;
	intro: string;
	lastUpdated: string;
	keywords: string[];
	sections: MethodologySection[];
	relatedLinks: Array<{
		href: string;
		label: string;
	}>;
};

const LAST_UPDATED = "2026-06-07";

export const METHODOLOGY_ENTRIES: MethodologyEntry[] = [
	{
		path: "/how-ai-stats-calculates-model-pricing",
		slug: "how-ai-stats-calculates-model-pricing",
		shortTitle: "Model pricing",
		title: "How AI Stats calculates model pricing",
		description:
			"How AI Stats maps provider price sheets, meters, and routing rules into the public model pricing shown across the catalog.",
		intro:
			"This page explains how AI Stats turns provider pricing sources into the public pricing values shown on model and provider pages.",
		lastUpdated: LAST_UPDATED,
		keywords: [
			"AI model pricing methodology",
			"API pricing methodology",
			"token pricing",
			"AI Stats pricing",
		],
		sections: [
			{
				heading: "What we are measuring",
				paragraphs: [
					"AI Stats tracks the public execution price for a model-provider combination, including the meter type, unit size, currency, and plan context used by the upstream provider or gateway configuration.",
					"We separate database pricing visibility from gateway top-up fees. Public model pricing focuses on what a request costs to execute, while the pricing page explains any platform-level credit purchase fees.",
				],
			},
			{
				heading: "Primary inputs",
				paragraphs: [
					"Pricing values are sourced from structured provider pricing rules, provider-model capability mappings, and model metadata stored in the catalog.",
					"When a provider exposes multiple meters for a model, AI Stats keeps the capability-level pricing so the visible page can distinguish text generation, embeddings, image generation, or other billable surfaces where applicable.",
				],
			},
			{
				heading: "How prices are normalised",
				paragraphs: [
					"Provider price sheets arrive in different units such as per token, per 1M tokens, per image, per second, or per request. AI Stats stores the raw unit and unit size, then calculates consistent display values for the catalog and calculator.",
					"Currency is preserved as published. Where a provider exposes separate input and output rates, those are shown separately rather than collapsed into a blended estimate.",
				],
			},
			{
				heading: "Effective dates and change handling",
				paragraphs: [
					"Pricing rules can carry effective start and end dates. When multiple rules exist for the same capability, AI Stats prefers the active rule with the strongest match and the highest operational priority.",
					"When a provider updates a model price, the older rule is retained only as historical context where the data model supports it; the public catalog is meant to reflect the current active price.",
				],
			},
			{
				heading: "Caveats",
				paragraphs: [
					"Some providers publish incomplete or delayed public pricing for preview models, region-specific SKUs, or enterprise-only offerings. In those cases AI Stats may show partial pricing or omit a comparison until the rule can be verified.",
					"Displayed prices are an operational reference, not a billing contract. Always confirm production billing terms with the provider or your AI Stats commercial plan where necessary.",
				],
			},
		],
		relatedLinks: [
			{ href: "/pricing", label: "Gateway pricing" },
			{ href: "/tools/pricing-calculator", label: "Pricing calculator" },
			{ href: "/models", label: "Model database" },
		],
	},
	{
		path: "/how-ai-stats-measures-latency-throughput",
		slug: "how-ai-stats-measures-latency-throughput",
		shortTitle: "Latency and throughput",
		title: "How AI Stats measures latency and throughput",
		description:
			"How AI Stats defines the latency, throughput, and request-performance metrics shown in rankings and model or provider performance pages.",
		intro:
			"This page explains what AI Stats counts as latency and throughput, how those metrics are aggregated, and why results can vary by route and timeframe.",
		lastUpdated: LAST_UPDATED,
		keywords: [
			"AI model latency methodology",
			"AI throughput methodology",
			"LLM latency",
			"AI Stats performance",
		],
		sections: [
			{
				heading: "What we are measuring",
				paragraphs: [
					"Latency represents the elapsed request time recorded by the gateway for a routed completion, subject to the instrumentation available for that request type.",
					"Throughput represents the output rate observed for successful requests, typically normalized to tokens per second for text-generation style workloads.",
				],
			},
			{
				heading: "Aggregation windows",
				paragraphs: [
					"Public performance views use rolling windows such as the last 24 hours for detailed performance and longer periods for leaderboard and trend summaries.",
					"Median values are preferred over averages for public displays because a small number of slow outliers can distort means and produce misleading rankings.",
				],
			},
			{
				heading: "Filtering and eligibility",
				paragraphs: [
					"AI Stats excludes obviously invalid records, unknown identifiers, and rows without enough usable request volume to support a meaningful comparison.",
					"Performance pages and leaderboards only rank rows with finite, positive throughput or latency values once the relevant thresholds are met.",
				],
			},
			{
				heading: "Why values can move",
				paragraphs: [
					"Latency and throughput are operational measurements, not intrinsic constants of a model. They can move because of provider routing, regional load, model updates, queueing behavior, prompt length, output length, and transport conditions.",
					"A model may therefore rank differently across providers, across time windows, or across the gateway and the provider's own direct benchmarks.",
				],
			},
			{
				heading: "Caveats",
				paragraphs: [
					"Public performance charts are designed for directional comparison. They are not a substitute for your own workload-specific benchmarking under your own prompt mix, concurrency, and latency budget.",
					"If a page has insufficient current data, AI Stats may show an empty state and treat that route as a weak search candidate until enough public volume exists.",
				],
			},
		],
		relatedLinks: [
			{ href: "/rankings", label: "Rankings" },
			{ href: "/models", label: "Models" },
			{ href: "/api-providers", label: "Providers" },
		],
	},
	{
		path: "/how-ai-stats-normalises-ai-benchmarks",
		slug: "how-ai-stats-normalises-ai-benchmarks",
		shortTitle: "Benchmark normalisation",
		title: "How AI Stats normalises AI benchmarks",
		description:
			"How AI Stats stores benchmark scores, variants, and sort direction while keeping benchmark displays aligned across different sources.",
		intro:
			"This page explains how AI Stats treats benchmark data from different sources without pretending that every benchmark is directly comparable.",
		lastUpdated: LAST_UPDATED,
		keywords: [
			"AI benchmark methodology",
			"benchmark normalization",
			"LLM benchmark scores",
			"AI Stats benchmarks",
		],
		sections: [
			{
				heading: "What we store",
				paragraphs: [
					"Each benchmark result is stored with a benchmark identifier, a score, optional variant metadata, source links, and self-reported flags where relevant.",
					"Benchmarks also carry category and sort-direction metadata so AI Stats can distinguish measures where higher is better from measures where lower is better.",
				],
			},
			{
				heading: "What normalisation means here",
				paragraphs: [
					"Normalisation in AI Stats does not mean converting all benchmarks into one universal score. It means preserving enough context to present each benchmark consistently and sort it correctly.",
					"When benchmarks use different variants, prompts, or evaluation protocols, AI Stats keeps those differences visible instead of flattening them into a single synthetic ranking.",
				],
			},
			{
				heading: "Ranking logic",
				paragraphs: [
					"For benchmark tables, AI Stats respects the benchmark's declared ordering direction. A lower score can therefore rank above a higher one when the benchmark measures error rate, latency, or another lower-is-better quantity.",
					"If a score cannot be verified or lacks enough context, it may still be stored with source notes but should not be interpreted as equal to a fully verified leaderboard row.",
				],
			},
			{
				heading: "Source quality and disclosure",
				paragraphs: [
					"Benchmark results may come from provider disclosures, benchmark organizers, or other public sources. AI Stats retains source links so readers can inspect the origin of a result.",
					"Self-reported scores are flagged as such where the source format supports it. That flag is a transparency signal, not an automatic rejection of the score.",
				],
			},
			{
				heading: "Caveats",
				paragraphs: [
					"Benchmark scores are one input to model selection, not the full answer. Real production fit also depends on cost, latency, reliability, modality support, and tooling constraints.",
					"Two models with similar benchmark numbers may still behave very differently in your own tasks, especially when prompt style or context length changes.",
				],
			},
		],
		relatedLinks: [
			{ href: "/benchmarks", label: "Benchmarks" },
			{ href: "/models", label: "Models" },
			{ href: "/compare", label: "Compare models" },
		],
	},
	{
		path: "/how-ai-stats-tracks-provider-availability",
		slug: "how-ai-stats-tracks-provider-availability",
		shortTitle: "Provider availability",
		title: "How AI Stats tracks provider availability",
		description:
			"How AI Stats maps models to providers, tracks gateway availability, and interprets provider-specific coverage on public catalog pages.",
		intro:
			"This page explains how AI Stats decides whether a model is available on a provider and what the public provider coverage views are intended to mean.",
		lastUpdated: LAST_UPDATED,
		keywords: [
			"provider availability methodology",
			"API provider coverage",
			"model availability",
			"AI Stats providers",
		],
		sections: [
			{
				heading: "What availability means on AI Stats",
				paragraphs: [
					"Provider availability means AI Stats has a model-provider mapping for a specific API route, capability surface, or gateway-executable pairing.",
					"It does not guarantee perpetual uptime, universal account access, or identical commercial terms across every region and customer tier.",
				],
			},
			{
				heading: "How mappings are stored",
				paragraphs: [
					"AI Stats stores canonical model identifiers separately from provider-specific model identifiers so one model can be tracked across multiple providers without losing provider-specific details.",
					"Provider model rows can also carry capability metadata, prompt-training policy overrides, active-gateway state, modality information, and effective date windows.",
				],
			},
			{
				heading: "Gateway-active versus catalog-visible",
				paragraphs: [
					"A provider-model mapping can exist in the catalog before it is fully active on the public gateway. The catalog is meant to show coverage and operational context, while gateway state signals whether that route is available for execution.",
					"That distinction matters because some models appear in provider documentation before they are broadly enabled, stable, or routable through a common interface.",
				],
			},
			{
				heading: "When provider pages change",
				paragraphs: [
					"Provider pages change when model mappings, capability rules, pricing rules, or provider metadata are updated. AI Stats revalidates those pages and can notify external discovery systems such as IndexNow when public URLs materially change.",
					"Because provider coverage is operational data, totals can move as routes are added, disabled, renamed, or recategorized.",
				],
			},
			{
				heading: "Caveats",
				paragraphs: [
					"Availability on AI Stats should be read as a current catalog signal, not a contractual promise. Enterprise allowlists, region locks, quotas, or staged rollouts can still affect whether a route works for a given account.",
					"If a provider page has too little public data to stand on its own, AI Stats may prefer reduced indexing until the page contains enough verified coverage information.",
				],
			},
		],
		relatedLinks: [
			{ href: "/api-providers", label: "Provider database" },
			{ href: "/models", label: "Models" },
			{ href: "/rankings", label: "Rankings" },
		],
	},
];

export const METHODOLOGY_ENTRY_BY_SLUG = Object.fromEntries(
	METHODOLOGY_ENTRIES.map((entry) => [entry.slug, entry]),
) as Record<string, MethodologyEntry>;
