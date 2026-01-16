import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import getDbStats, { type DbStats } from "@/lib/fetchers/landing/dbStats";

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

type StatDef = {
	key: keyof DbStats;
	label: string;
	bucket: number;
	route: string;
};

export default async function DatabaseStats() {
	// Runs at build time (static page) → baked HTML
	const data = await getDbStats();

	const statDefinitions: StatDef[] = [
		{ key: "models", label: "Models", bucket: 25, route: "/models" },
		{
			key: "organisations",
			label: "Organisations",
			bucket: 5,
			route: "/organisations",
		},
		{
			key: "benchmarks",
			label: "Benchmarks",
			bucket: 10,
			route: "/benchmarks",
		},
		{
			key: "benchmark_results",
			label: "Benchmark Results",
			bucket: 100,
			route: "/benchmarks",
		},
		{
			key: "api_providers",
			label: "API Providers",
			bucket: 10,
			route: "/api-providers",
		},
	];

	const stats = statDefinitions.map((def) => {
		const raw = (data?.[def.key] ?? 0) as number;
		const rounded = roundDisplayValue(raw, def.bucket);
		return {
			label: def.label,
			value: formatStat(rounded),
			route: def.route,
		};
	});

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 items-stretch">
			{stats.map((stat) => (
				<Link
					href={stat.route}
					className="hover:scale-105 transition-transform duration-150"
					key={stat.label}
					style={{ textDecoration: "none" }}
				>
					<Card className="h-full gap-0 p-4 flex flex-col items-center justify-between border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 cursor-pointer">
						<CardHeader className="text-center p-0 w-full">
							<div className="flex-1 flex items-center justify-center">
								<CardTitle className="text-3xl font-bold">
									{stat.value}
								</CardTitle>
							</div>
						</CardHeader>
						<CardContent className="w-full flex items-end justify-center p-0">
							<span className="text-sm font-medium text-center text-gray-500">
								{stat.label}
							</span>
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}
