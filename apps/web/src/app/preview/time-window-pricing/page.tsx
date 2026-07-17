import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Time-window pricing preview",
	robots: { index: false, follow: false },
};

const peakWindows = [
	{
		label: "Peak",
		timezone: "UTC" as const,
		start_time: "01:00",
		end_time: "04:00",
		priority: 100,
	},
	{
		label: "Peak",
		timezone: "UTC" as const,
		start_time: "06:00",
		end_time: "10:00",
		priority: 100,
	},
];

const deepSeekProvider = {
	provider: {
		api_provider_id: "deepseek",
		api_provider_name: "DeepSeek",
		provider_family_id: "deepseek",
		offer_label: null,
		offer_scope: "global",
		status: "active",
		routing_status: "active",
		country_code: "CN",
		zero_data_retention: "optional",
		residency_mode: "unknown",
		prompt_training_policy: "unknown",
		data_policy_tier: "unknown",
		data_policy_confidence: "unknown",
		data_policy_contract_mode: "none",
	},
	provider_models: [
		{
			id: "deepseek:deepseek/deepseek-v4-pro:text.generate",
			api_provider_id: "deepseek",
			model_id: "deepseek/deepseek-v4-pro",
			provider_model_slug: "deepseek-v4-pro",
			endpoint: "text.generate",
			capability_status: "active",
			routing_status: "active",
			is_active_gateway: true,
			input_modalities: "text",
			output_modalities: "text",
			context_length: 1_000_000,
			max_input_tokens: 1_000_000,
			max_output_tokens: 128_000,
		},
	],
	pricing_rules: [
		{
			id: "deepseek-v4-pro-input-preview",
			model_key: "deepseek:deepseek/deepseek-v4-pro:text.generate",
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 0.435,
			currency: "USD",
			note: "Preview fixture",
			match: [],
			priority: 100,
			effective_from: "2026-05-31T15:59:00Z",
			effective_to: null,
			billing_timestamp_basis: "provider_accept",
			time_windows: peakWindows.map((window) => ({
				...window,
				price_per_unit: 0.87,
			})),
		},
		{
			id: "deepseek-v4-pro-cache-preview",
			model_key: "deepseek:deepseek/deepseek-v4-pro:text.generate",
			pricing_plan: "standard",
			meter: "cached_read_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 0.003625,
			currency: "USD",
			note: "Preview fixture",
			match: [],
			priority: 100,
			effective_from: "2026-05-31T15:59:00Z",
			effective_to: null,
			billing_timestamp_basis: "provider_accept",
			time_windows: peakWindows.map((window) => ({
				...window,
				price_per_unit: 0.00725,
			})),
		},
		{
			id: "deepseek-v4-pro-output-preview",
			model_key: "deepseek:deepseek/deepseek-v4-pro:text.generate",
			pricing_plan: "standard",
			meter: "output_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 0.87,
			currency: "USD",
			note: "Preview fixture",
			match: [],
			priority: 100,
			effective_from: "2026-05-31T15:59:00Z",
			effective_to: null,
			billing_timestamp_basis: "provider_accept",
			time_windows: peakWindows.map((window) => ({
				...window,
				price_per_unit: 1.74,
			})),
		},
	],
} as ProviderPricing;

const periodOptions = {
	peak: {
		label: "Peak",
		timeLabel: "02:30 UTC",
		timeMs: Date.parse("2026-07-17T02:30:00Z"),
	},
	"off-peak": {
		label: "Off-peak",
		timeLabel: "05:30 UTC",
		timeMs: Date.parse("2026-07-17T05:30:00Z"),
	},
} as const;

type DemoPeriod = keyof typeof periodOptions;

export default function TimeWindowPricingPreviewPage({
	searchParams,
}: {
	searchParams: Promise<{ period?: string }>;
}) {
	if (process.env.VERCEL_ENV === "production") notFound();
	return (
		<Suspense fallback={<PreviewFallback />}>
			<TimeWindowPricingPreview searchParams={searchParams} />
		</Suspense>
	);
}

async function TimeWindowPricingPreview({
	searchParams,
}: {
	searchParams: Promise<{ period?: string }>;
}) {
	await connection();

	const requestedPeriod = (await searchParams).period;
	const period: DemoPeriod = requestedPeriod === "off-peak" ? "off-peak" : "peak";
	const selected = periodOptions[period];

	return (
		<main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
			<div className="mb-8 space-y-5">
				<div className="space-y-2">
					<div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
						Preview fixture
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">DeepSeek V4 Pro</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						Illustrative announced pricing windows rendered through the production model-page components. This fixture does not affect billing or catalog data.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3 border-y border-amber-200/80 py-3 text-sm dark:border-amber-900/70">
					<span className="font-medium text-amber-800 dark:text-amber-300">
						Frozen billing time: {selected.timeLabel}
					</span>
					<div className="flex items-center rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
						{(Object.keys(periodOptions) as DemoPeriod[]).map((option) => (
							<Link
								key={option}
								href={`/preview/time-window-pricing?period=${option}`}
								aria-current={period === option ? "page" : undefined}
								className={cn(
									"rounded px-3 py-1.5 text-xs font-medium transition-colors",
									period === option
										? "bg-foreground text-background"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{periodOptions[option].label}
							</Link>
						))}
					</div>
				</div>
			</div>

			<ModelPricingClient
				key={period}
				modelId="deepseek/deepseek-v4-pro"
				providers={[deepSeekProvider]}
				creatorOrgId="deepseek"
				initialPricingTimeMs={selected.timeMs}
				freezePricingClock
				showHeader
			/>
		</main>
	);
}

function PreviewFallback() {
	return (
		<main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
			<div className="h-8 w-64 animate-pulse rounded bg-muted" />
			<div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
			<div className="mt-14 h-24 animate-pulse rounded-md border border-zinc-200 dark:border-zinc-800" />
		</main>
	);
}
