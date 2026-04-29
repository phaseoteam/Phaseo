import Link from "next/link";
import { ArrowRight, Boxes, Coins, Route } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import { getTopModelsWithMetadata } from "@/lib/fetchers/rankings/getRankingsData";
import { getModelDetailsHref } from "@/lib/models/modelHref";

function formatCompact(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

export function ExperimentalGatewayShowcaseFallback() {
	return (
		<section className="rounded-[2.25rem] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(24,22,18,0.05)] dark:border-zinc-800/80 dark:bg-zinc-950/78">
			<div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
				<div className="h-64 animate-pulse rounded-[1.6rem] bg-zinc-100 dark:bg-zinc-900" />
				<div className="grid gap-3">
					<div className="h-24 animate-pulse rounded-[1.4rem] bg-zinc-100 dark:bg-zinc-900" />
					<div className="h-56 animate-pulse rounded-[1.4rem] bg-zinc-100 dark:bg-zinc-900" />
				</div>
			</div>
		</section>
	);
}

export default async function ExperimentalGatewayShowcase() {
	const monthlyWindowHours = 24 * 30;
	const [metrics, topModelsRes] = await Promise.all([
		getGatewayMarketingMetrics(monthlyWindowHours),
		getTopModelsWithMetadata("week", 4),
	]);

	const topModels = (topModelsRes.data ?? [])
		.filter((row) => Number(row.total_tokens ?? 0) > 0)
		.slice(0, 4)
		.map((row) => {
			const modelId = row.model_id;
			const organisationId = row.organisation_id ?? null;
			const prefixOrganisation =
				typeof modelId === "string" && modelId.includes("/")
					? modelId.split("/")[0]
					: null;
			const organisationName =
				row.organisation_name ?? prefixOrganisation ?? "Unknown organisation";

			return {
				key: modelId,
				name: row.model_name ?? modelId,
				organisation: organisationName,
				logoId: organisationId ?? prefixOrganisation ?? modelId,
				href: getModelDetailsHref(organisationId, modelId),
				tokens: Number(row.total_tokens ?? 0),
			};
		});

	const stats = [
		{
			label: "Monthly tokens",
			value: `${formatCompact(metrics.summary.tokens24h)}+`,
			icon: Coins,
		},
		{
			label: "Active models",
			value: `${formatCompact(metrics.summary.supportedModels ?? 0)}+`,
			icon: Boxes,
		},
		{
			label: "Supported providers",
			value: `${formatCompact(metrics.summary.supportedProviders ?? 0)}+`,
			icon: Route,
		},
	] as const;

	return (
		<section className="rounded-[2.25rem] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(24,22,18,0.05)] dark:border-zinc-800/80 dark:bg-zinc-950/78 sm:p-7">
			<div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="flex flex-col justify-between rounded-[1.9rem] border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900/55">
					<div className="space-y-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">
							Gateway snapshot
						</p>
						<h2 className="max-w-md text-4xl font-semibold tracking-[-0.06em] text-zinc-950 dark:text-zinc-50">
							Production telemetry, without the dashboard noise.
						</h2>
						<p className="max-w-md text-sm leading-7 text-zinc-600 dark:text-zinc-300">
							The experimental landing page should still show the product doing real
							work, but with fewer boxes and a cleaner hierarchy.
						</p>
					</div>
					<div className="mt-6 flex flex-wrap gap-3">
						<Button asChild className="h-11 rounded-full px-5 text-sm font-semibold">
							<Link href="/gateway">
								Explore gateway
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button
							asChild
							variant="outline"
							className="h-11 rounded-full px-5 text-sm font-semibold"
						>
							<Link href="/rankings">View live rankings</Link>
						</Button>
					</div>
				</div>

				<div className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-3">
						{stats.map((stat) => {
							const Icon = stat.icon;
							return (
								<div
									key={stat.label}
									className="rounded-[1.4rem] border border-zinc-200/80 bg-white px-4 py-4 dark:border-zinc-800/80 dark:bg-zinc-950/80"
								>
									<div className="flex items-center justify-between gap-3">
										<p className="text-[1.55rem] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50">
											{stat.value}
										</p>
										<Icon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
									</div>
									<p className="mt-2 text-xs uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
										{stat.label}
									</p>
								</div>
							);
						})}
					</div>

					<div className="rounded-[1.6rem] border border-zinc-200/80 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-950/80">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
									Most used models this week
								</p>
								<p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">
									A quick read on what is actually getting routed.
								</p>
							</div>
							<Link
								href="/rankings"
								className="text-sm font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
							>
								Rankings
							</Link>
						</div>
						<div className="mt-4 grid gap-3">
							{topModels.map((model, index) => (
								<div
									key={model.key}
									className="flex items-center gap-3 rounded-[1.2rem] border border-zinc-200/80 bg-white px-3 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/55"
								>
									<div className="w-6 text-xs font-medium text-zinc-500 dark:text-zinc-400">
										#{index + 1}
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
										<div className="relative h-4.5 w-4.5">
											<Logo
												id={model.logoId}
												alt={model.organisation}
												fill
												className="object-contain"
											/>
										</div>
									</div>
									<div className="min-w-0 flex-1">
										{model.href ? (
											<Link
												href={model.href}
												className="block truncate text-sm font-semibold text-zinc-950 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300"
											>
												{model.name}
											</Link>
										) : (
											<p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
												{model.name}
											</p>
										)}
										<p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
											{model.organisation}
										</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
											{formatCompact(model.tokens)}
										</p>
										<p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
											tokens
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
