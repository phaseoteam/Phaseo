import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { getSupportedModelsStatsCached } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

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

	const stats = [
		{
			label: "Total Models",
			raw: modelsCount,
			route: "/models",
		},
		{
			label: "Organisations",
			raw: orgsCount,
			route: "/providers",
		},
		{
			label: "API Models",
			raw: apiCount,
			route: "/prices",
		},
		{
			label: "New (90d)",
			raw: recentCount,
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
