import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { getSupportedModelsStatsCached } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

function roundBucket(value: number, bucket: number) {
	if (bucket <= 0) return { value, rounded: false } as const;
	const roundedValue = Math.round(value / bucket) * bucket;
	return { value: roundedValue, rounded: roundedValue !== value } as const;
}

function formatWithK(value: number) {
	if (value >= 1000) {
		const v = value / 1000;
		// show one decimal when needed (e.g., 2.5K)
		return v % 1 === 0 ? `${v.toFixed(0)}K` : `${v.toFixed(1)}K`;
	}
	return value.toLocaleString();
}

export default async function SupportedModelsStats() {
	// Fetch counts via cached fetcher (falls back to zeros on error)
	let modelsCount = 0;
	let orgsCount = 0;
	let apiCount = 0;
	let recentCount = 0;

	try {
		const includeHidden = await resolveIncludeHidden();
		const stats = await getSupportedModelsStatsCached(includeHidden);
		modelsCount = stats.modelsCount ?? 0;
		orgsCount = stats.orgsCount ?? 0;
		apiCount = stats.apiCount ?? 0;
		recentCount = stats.recentCount ?? 0;
	} catch (e) {
		// noop - fallback to defaults
	}

	const modelsRounded = roundBucket(modelsCount, 25);
	const orgsRounded = roundBucket(orgsCount, 10);
	const apiRounded = roundBucket(apiCount, 25);

	const stats = [
		{
			label: "Total Models",
			raw: modelsRounded.value,
			rounded: modelsRounded.rounded,
			route: "/models",
		},
		{
			label: "Organisations",
			raw: orgsRounded.value,
			rounded: orgsRounded.rounded,
			route: "/providers",
		},
		{
			label: "API Models",
			raw: apiRounded.value,
			rounded: apiRounded.rounded,
			route: "/prices",
		},
		{
			label: "New (90d)",
			raw: recentCount,
			rounded: false,
			route: "/models",
		},
	];

	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-stretch">
			{stats.map((stat) => (
				<Link
					href={stat.route}
					key={stat.label}
					className="hover:scale-105 transition-transform duration-150"
					style={{ textDecoration: "none" }}
				>
					<Card className="h-full p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 cursor-pointer">
						<CardHeader className="text-center p-0">
							<CardTitle className="text-2xl font-bold">
								<span className="text-2xl font-bold tabular-nums">
									{formatWithK(stat.raw)}
									{stat.rounded ? "+" : ""}
								</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col items-center justify-center p-0">
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
