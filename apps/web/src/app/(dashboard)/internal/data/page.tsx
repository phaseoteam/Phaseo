import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function SettingsInternalPage() {
	const supabase = await createClient();

	const [{ count: modelsCount }, { count: organisationsCount }, { count: providersCount }, { count: benchmarksCount }] =
		await Promise.all([
			supabase.from("data_models").select("*", { count: "exact", head: true }),
			supabase.from("data_organisations").select("*", { count: "exact", head: true }),
			supabase.from("data_api_providers").select("*", { count: "exact", head: true }),
			supabase.from("data_benchmarks").select("*", { count: "exact", head: true }),
		]);

	const items = [
		{ label: "Models", href: "/internal/data/models", count: modelsCount ?? 0 },
		{ label: "Organisations", href: "/internal/data/organisations", count: organisationsCount ?? 0 },
		{ label: "API Providers", href: "/internal/data/api-providers", count: providersCount ?? 0 },
		{ label: "Benchmarks", href: "/internal/data/benchmarks", count: benchmarksCount ?? 0 },
	];

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Internal Data Audit</h1>
				<p className="text-sm text-muted-foreground">
					Use dedicated pages to create, edit, and delete data records.
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
