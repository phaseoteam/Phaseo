import Link from "next/link";
import { fetchAdminCatalogCounts } from "@/lib/fetchers/internal/fetchAdminCatalog";

export default async function SettingsInternalPage() {
	const counts = await fetchAdminCatalogCounts();

	const items = [
		{ label: "Models", href: "/internal/data/models", count: counts.models },
		{ label: "Organisations", href: "/internal/data/organisations", count: counts.organisations },
		{ label: "API Providers", href: "/internal/data/api-providers", count: counts.providers },
		{ label: "Benchmarks", href: "/internal/data/benchmarks", count: counts.benchmarks },
	];

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Internal Data Editor</h1>
				<p className="text-sm text-muted-foreground">
					Use dedicated pages to create, edit, and delete records.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
				{items.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						className="rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors"
					>
						<div className="text-sm text-muted-foreground">Records</div>
						<div className="mt-0.5 text-xl font-semibold">{item.count}</div>
						<div className="mt-2 text-sm">{item.label}</div>
					</Link>
				))}
			</div>
		</div>
	);
}
