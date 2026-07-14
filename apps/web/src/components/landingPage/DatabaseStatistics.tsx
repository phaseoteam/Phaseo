import Link from "next/link";
import { fetchFrontendLandingStats } from "@/lib/fetchers/frontend/fetchPublicCatalog";

function roundDisplayValue(raw: number, bucket: number) {
	if (bucket <= 0) return raw;
	if (raw > 0 && raw < bucket) return raw;
	return Math.floor(raw / bucket) * bucket;
}

function formatStat(num: number) {
	if (num >= 1_000_000)
		return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}m+`;
	if (num >= 1_000)
		return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}k+`;
	return `${num}+`;
}

function formatCompact(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0";
	if (value >= 1_000_000_000)
		return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000)
		return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000)
		return `${(value / 1_000).toFixed(1)}K`;
	return value.toLocaleString();
}

export default async function DatabaseStats() {
	const { db: data, monthlyTokenTotal } = await fetchFrontendLandingStats();

	const stats = [
		{
			label: "Models",
			value: formatStat(roundDisplayValue(data.models ?? 0, 25)),
			route: "/models",
		},
		{
			label: "Providers",
			value: formatStat(roundDisplayValue(data.api_providers ?? 0, 5)),
			route: "/api-providers",
		},
		{
			label: "Monthly Tokens",
			value: `${formatCompact(monthlyTokenTotal ?? 0)}+`,
			route: "/rankings",
		},
	] as const;

	return (
		<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
			{stats.map((stat) => (
				<Link
					key={stat.label}
					href={stat.route}
					className="group rounded-[20px] border border-zinc-200/70 bg-white/92 px-4 py-3.5 text-center transition-colors duration-200 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:hover:border-zinc-700"
				>
					<div className="flex flex-col items-center justify-center gap-1.5">
						<p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
							{stat.label}
						</p>
						<p className="text-2xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
							{stat.value}
						</p>

					</div>
				</Link>
			))}
		</div>
	);
}


