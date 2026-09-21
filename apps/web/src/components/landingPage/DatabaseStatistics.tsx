import Link from "next/link";
import {
	fetchFrontendLandingStats,
	fetchFrontendSignInSupportedModelsStats,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { DisplayNumber } from "@/components/display/DisplayValue";

function roundDisplayValue(raw: number, bucket: number) {
	if (bucket <= 0) return raw;
	if (raw > 0 && raw < bucket) return raw;
	return Math.floor(raw / bucket) * bucket;
}

export default async function DatabaseStats() {
	const [{ db: data, monthlyTokenTotal }, gatewayStats] = await Promise.all([
		fetchFrontendLandingStats(),
		fetchFrontendSignInSupportedModelsStats(),
	]);

	const stats = [
		{
			label: "Catalog models",
			value: <><DisplayNumber value={roundDisplayValue(data.models ?? 0, 25)} />+</>,
			route: "/models",
		},
		{
			label: "Routable models",
			value: <><DisplayNumber value={roundDisplayValue(gatewayStats.apiCount ?? 0, 25)} />+</>,
			route: "/models",
		},
		{
			label: "Catalog providers",
			value: <><DisplayNumber value={roundDisplayValue(data.api_providers ?? 0, 5)} />+</>,
			route: "/api-providers",
		},
		{
			label: "Monthly tokens routed",
			value: <><DisplayNumber value={monthlyTokenTotal ?? 0} options={{ maximumFractionDigits: 1 }} />+</>,
			route: "/rankings",
		},
	] as const;

	return (
		<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
