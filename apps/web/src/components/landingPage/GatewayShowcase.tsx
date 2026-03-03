import Link from "next/link";
import { Suspense } from "react";
import {
	ArrowRight,
	Boxes,
	Coins,
	Route,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import {
	getAppImageUrlsByIds,
	getTopApps,
	getTopModelsWithMetadata,
} from "@/lib/fetchers/rankings/getRankingsData";
import { getModelDetailsHref } from "@/lib/models/modelHref";

type TopModelRow = {
	key: string;
	name: string;
	organisation: string;
	logoId: string;
	href: string | null;
	tokens: number;
};

type TopAppRow = {
	appId: string;
	name: string;
	imageUrl: string | null;
	tokens: number;
};

function formatCompact(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function getInitial(name: string) {
	return name.trim().charAt(0).toUpperCase() || "A";
}

export function GatewayShowcaseFallback() {
	return (
		<div className="space-y-8">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<div
						key={index}
						className="h-24 animate-pulse rounded-xl border border-border/60 bg-muted/50"
					/>
				))}
			</div>
			<div className="h-80 animate-pulse rounded-2xl border border-border/60 bg-muted/50" />
			<div className="h-80 animate-pulse rounded-2xl border border-border/60 bg-muted/50" />
			<div className="h-9 w-full max-w-3xl animate-pulse rounded bg-muted" />
		</div>
	);
}

function SectionHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1.5">
			<h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 sm:text-xl">
				{title}
			</h3>
			<p className="text-sm text-zinc-600 dark:text-zinc-300">
				{description}
			</p>
		</div>
	);
}

function EmptyTelemetry({ text }: { text: string }) {
	return (
		<p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
			{text}
		</p>
	);
}

async function GatewayShowcaseData() {
	const monthlyWindowHours = 24 * 30;
	const [metrics, topModelsRes, topAppsRes] = await Promise.all([
		getGatewayMarketingMetrics(monthlyWindowHours),
		getTopModelsWithMetadata("week", 6),
		getTopApps("week", 25),
	]);

	const topAppRows = [...topAppsRes.data]
		.filter((row) => Number(row.tokens ?? 0) > 0)
		.filter((row) => Boolean(row.app_id))
		.sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
		.slice(0, 6);

	const appIds = Array.from(
		new Set(topAppRows.map((row) => row.app_id).filter(Boolean))
	);

	const appImageMap = await getAppImageUrlsByIds(appIds);

	const topModels: TopModelRow[] = (topModelsRes.data ?? [])
		.filter((row) => Number(row.total_tokens ?? 0) > 0)
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

	const topApps: TopAppRow[] = topAppRows.map((row) => ({
		appId: row.app_id,
		name: row.app_name ?? row.app_id,
		imageUrl: appImageMap[row.app_id] ?? row.image_url ?? null,
		tokens: Number(row.tokens ?? 0),
	}));

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
		<>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{stats.map((stat) => {
					const Icon = stat.icon;
					return (
						<div
							key={stat.label}
							className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
						>
							<div className="flex items-center justify-between">
								<p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
									{stat.value}
								</p>
								<Icon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
							</div>
							<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
								{stat.label}
							</p>
						</div>
					);
				})}
			</div>

			<div className="h-px bg-zinc-200 dark:bg-zinc-800" />

			<div className="space-y-4">
				<SectionHeader
					title="Most used models"
					description="Top models by weekly token usage across the gateway."
				/>
				<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{topModels.length > 0 ? (
						topModels.map((model, index) => (
							<div
								key={model.key}
								className="flex min-w-0 items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
							>
								<div className="w-5 text-xs text-muted-foreground">
									#{index + 1}
								</div>
								<div className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 p-1.5 dark:border-zinc-800">
									<div className="relative h-full w-full">
										<Logo
											id={model.logoId}
											alt={model.organisation}
											fill
											className="object-contain"
										/>
									</div>
								</div>
								<div className="min-w-0 flex-1 overflow-hidden">
									{model.href ? (
										<Link
											href={model.href}
											className="block max-w-full truncate text-sm font-medium underline decoration-transparent transition-colors duration-200 hover:decoration-current"
										>
											{model.name}
										</Link>
									) : (
										<div className="max-w-full truncate text-sm font-medium">
											{model.name}
										</div>
									)}
									<p className="truncate text-xs text-muted-foreground">
										{model.organisation}
									</p>
								</div>
								<div className="text-right">
									<div className="text-sm tabular-nums font-medium">
										{formatCompact(model.tokens)}
									</div>
									<div className="text-[11px] text-muted-foreground">
										tokens
									</div>
								</div>
							</div>
						))
					) : (
						<EmptyTelemetry text="Model usage data will appear once enough gateway token telemetry is available." />
					)}
				</div>
			</div>

			{topApps.length > 0 ? (
				<>
					<div className="h-px bg-zinc-200 dark:bg-zinc-800" />

					<div className="space-y-4">
						<SectionHeader
							title="Top apps"
							description="Most active apps by weekly token usage."
						/>
						<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{topApps.map((app, index) => (
								<div
									key={`${app.appId}:${index}`}
									className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
								>
									<div className="w-5 text-xs text-muted-foreground">
										#{index + 1}
									</div>
									<Link
										href={`/apps/${encodeURIComponent(app.appId)}`}
										aria-label={app.name}
									>
										<Avatar className="h-9 w-9 rounded-lg border border-border/60">
											{app.imageUrl ? (
												<AvatarImage
													src={app.imageUrl}
													alt={app.name}
													className="object-cover"
												/>
											) : null}
											<AvatarFallback className="rounded-lg text-[11px] font-semibold">
												{getInitial(app.name)}
											</AvatarFallback>
										</Avatar>
									</Link>
									<div className="min-w-0 flex-1">
										<Link
											href={`/apps/${encodeURIComponent(app.appId)}`}
											className="block truncate text-sm font-medium underline decoration-transparent hover:decoration-current transition-colors duration-200"
										>
											{app.name}
										</Link>
										<p className="truncate text-xs text-muted-foreground">
											AI Stats app profile
										</p>
									</div>
									<div className="text-right">
										<div className="text-sm tabular-nums font-medium">
											{formatCompact(app.tokens)}
										</div>
										<div className="text-[11px] text-muted-foreground">
											tokens
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</>
			) : null}
		</>
	);
}

export default function GatewayShowcase() {
	return (
		<section className="space-y-8 py-2">
			<div className="space-y-4">
				<Badge
					variant="secondary"
					className="w-fit border border-zinc-300 bg-white text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
				>
					AI Stats Gateway
				</Badge>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="max-w-3xl space-y-3">
						<h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
							A model database built for discovery.
							<br className="hidden sm:block" /> A gateway built
							for production.
						</h2>
						<p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-base">
							Explore the model database, then ship through one
							unified API with routing, observability, and
							governance built in.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end lg:pt-1">
						<Button asChild className="h-10">
							<Link href="/gateway">
								Explore gateway
								<ArrowRight className="ml-1 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="/rankings">View live rankings</Link>
						</Button>
					</div>
				</div>
			</div>

			<Suspense fallback={<GatewayShowcaseFallback />}>
				<GatewayShowcaseData />
			</Suspense>
		</section>
	);
}

