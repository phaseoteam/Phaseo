import Link from "next/link";
import getDbStats from "@/lib/fetchers/landing/dbStats";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";

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
	const [data, gatewayMetrics] = await Promise.all([
		getDbStats(),
		getGatewayMarketingMetrics(24 * 30),
	]);

	const stats = [
		{
			label: "Tracked models",
			value: formatStat(roundDisplayValue(data.models ?? 0, 25)),
			route: "/models",
		},
		{
			label: "Tracked providers",
			value: formatStat(roundDisplayValue(data.api_providers ?? 0, 5)),
			route: "/api-providers",
		},
		{
			label: "Gateway monthly tokens",
			value: `${formatCompact(gatewayMetrics.summary.tokens24h ?? 0)}+`,
			route: "/gateway",
		},
	] as const;

	return (
		<div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{stats.map((stat) => (
				<Link
					key={stat.label}
					href={stat.route}
					className="group rounded-[24px] border border-zinc-200/70 bg-white/92 px-5 py-5 text-center transition-colors duration-200 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:hover:border-zinc-700"
				>
					<div className="flex flex-col items-center justify-center gap-2">
						<p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
							{stat.label}
						</p>
						<p className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-[2rem]">
							{stat.value}
						</p>

					</div>
				</Link>
			))}
		</div>
	);
}


