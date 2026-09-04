import { Activity, ArrowRight, Bot, Building2, CircleAlert, Database, Gauge, Landmark, Plus, Route, Shapes } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAdminCatalogCounts, fetchAdminCatalogOverview } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { CatalogSearch } from "./CatalogSearch";

const resourceMeta = {
	models: { label: "Models", href: "/internal/data/models", newHref: "/internal/data/models/new", icon: Bot, description: "Identity, lifecycle, lineage, notices, routes and pricing" },
	organisations: { label: "Organisations", href: "/internal/data/organisations", newHref: "/internal/data/organisations/new", icon: Building2, description: "Labs, publishers, profile data and links" },
	providers: { label: "API providers", href: "/internal/data/api-providers", newHref: "/internal/data/api-providers/new", icon: Route, description: "Provider identity, access, policies and regions" },
	benchmarks: { label: "Benchmarks", href: "/internal/data/benchmarks", newHref: "/internal/data/benchmarks/new", icon: Gauge, description: "Benchmark definitions, categories and score direction" },
} as const;

function changeHref(resourceType: string, resourceId: string) {
	if (["models", "model_graph", "provider_route", "pricing_sku", "model_notice", "model_alias"].includes(resourceType)) return `/internal/data/models/edit/${resourceId}`;
	if (resourceType === "organisations") return `/internal/data/organisations/${resourceId}/edit`;
	if (resourceType === "providers") return `/internal/data/api-providers/${resourceId}/edit`;
	if (resourceType === "benchmarks") return `/internal/data/benchmarks/${resourceId}/edit`;
	return null;
}

const readableResource = (value: string) => value.replaceAll("_", " ").replaceAll("-", " ");

export default async function SettingsInternalPage() {
	const [counts, overview] = await Promise.all([fetchAdminCatalogCounts(), fetchAdminCatalogOverview()]);
	const items = (Object.keys(resourceMeta) as Array<keyof typeof resourceMeta>).map((key) => ({ key, count: counts[key], ...resourceMeta[key] }));
	const routeCoverage = overview.routes.total > 0 ? Math.round((overview.routes.routable / overview.routes.total) * 100) : 0;

	return (
		<main className="container mx-auto max-w-7xl space-y-8 py-8 lg:py-10">
			<header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
				<div className="max-w-2xl">
					<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"><Database className="size-3.5" />Catalog operations</div>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Model database</h1>
					<p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">Find, create and maintain the records that power the catalog and gateway.</p>
				</div>
				<Button asChild><Link href="/internal/data/models/new"><Plus data-icon="inline-start" />New model</Link></Button>
			</header>

			<section aria-labelledby="find-record-heading" className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
				<div className="mb-4"><h2 id="find-record-heading" className="font-medium">Find a record</h2><p className="mt-1 text-sm text-muted-foreground">Search the right collection without hunting through navigation.</p></div>
				<CatalogSearch />
			</section>

			<section aria-labelledby="collections-heading">
				<div className="mb-3 flex items-center justify-between"><h2 id="collections-heading" className="text-sm font-medium">Collections</h2><span className="text-xs tabular-nums text-muted-foreground">{Object.values(counts).reduce((sum, count) => sum + count, 0).toLocaleString()} records</span></div>
				<div className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-2 xl:grid-cols-4">
					{items.map((item, index) => <div key={item.key} className={`group p-5 ${index > 0 ? "border-t md:border-t-0 md:border-l" : ""} ${index === 2 ? "md:border-l-0 md:border-t xl:border-l xl:border-t-0" : ""} ${index === 3 ? "md:border-t xl:border-t-0" : ""}`}>
						<div className="flex items-start justify-between"><span className="rounded-md border bg-muted/40 p-2"><item.icon className="size-4" /></span><span className="text-2xl font-semibold tabular-nums">{item.count.toLocaleString()}</span></div>
						<h3 className="mt-4 font-medium">{item.label}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{item.description}</p>
						<div className="mt-4 flex items-center gap-3 text-sm"><Link href={item.href} className="inline-flex items-center gap-1 font-medium hover:underline">Browse <ArrowRight className="size-3.5" /></Link><Link href={item.newHref} className="text-muted-foreground hover:text-foreground">Create</Link></div>
					</div>)}
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
				<section aria-labelledby="recent-heading" className="overflow-hidden rounded-xl border bg-card">
					<div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="recent-heading" className="flex items-center gap-2 font-medium"><Activity className="size-4" />Recent changes</h2><p className="mt-1 text-xs text-muted-foreground">Latest audited database writes</p></div><Badge variant="outline">Live</Badge></div>
					<div className="divide-y">
						{overview.recentChanges.length ? overview.recentChanges.map((change) => {
							const href = changeHref(change.resource_type, change.resource_id);
							const content = <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{change.resource_id}</span><span className="mt-0.5 block text-xs capitalize text-muted-foreground">{change.action} · {readableResource(change.resource_type)}</span></span><time dateTime={change.created_at} className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(change.created_at))}</time></>;
							return href ? <Link key={change.change_id} href={href} className="flex items-center gap-4 px-5 py-3 transition hover:bg-muted/40">{content}</Link> : <div key={change.change_id} className="flex items-center gap-4 px-5 py-3">{content}</div>;
						}) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No audited changes yet.</div>}
					</div>
				</section>

				<aside className="space-y-4">
					<div className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Shapes className="size-4" /><h2 className="font-medium">Coverage</h2></div><div className="mt-5 flex items-end justify-between"><span><span className="text-3xl font-semibold tabular-nums">{routeCoverage}%</span><span className="ml-1 text-sm text-muted-foreground">routable</span></span><span className="text-xs tabular-nums text-muted-foreground">{overview.routes.routable.toLocaleString()} / {overview.routes.total.toLocaleString()} routes</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${routeCoverage}%` }} /></div></div>
					<div className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><CircleAlert className="size-4" /><h2 className="font-medium">Needs attention</h2></div><div className="mt-4 space-y-3 text-sm"><Link href="/internal/data/models" className="flex items-center justify-between rounded-md border px-3 py-2.5 hover:bg-muted/40"><span>Hidden models</span><Badge variant={overview.attention.hiddenModels ? "secondary" : "outline"}>{overview.attention.hiddenModels}</Badge></Link><Link href="/internal/data/models" className="flex items-center justify-between rounded-md border px-3 py-2.5 hover:bg-muted/40"><span>Missing organisation</span><Badge variant={overview.attention.modelsWithoutLab ? "destructive" : "outline"}>{overview.attention.modelsWithoutLab}</Badge></Link></div></div>
					<div className="rounded-xl border border-dashed p-5"><div className="flex items-center gap-2"><Landmark className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Publishing</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">The database is authoritative. A daily snapshot exports catalog data to JSON for review and recovery.</p></div>
				</aside>
			</div>
		</main>
	);
}
