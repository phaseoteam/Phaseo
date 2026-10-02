import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BadgeCheck, GitFork, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchFrontendMarketplacePresets } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { MarketplacePreset } from "@/lib/fetchers/gateway/marketplaceTypes";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.gateway");
	return buildMetadata({
		title: t("marketplaceTitle"),
		description: t("marketplaceDescription"),
		path: "/gateway/marketplace",
	});
}

export default async function GatewayMarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
	const [{ q }, presets] = await Promise.all([searchParams, fetchFrontendMarketplacePresets()]);
	const t = await getTranslations("Product.gateway");
	const query = q?.trim().toLowerCase() ?? "";
	const matching = presets.filter((preset) => !query || [preset.name, preset.description, preset.publisher.displayName, preset.publisher.handle, preset.canonicalModel].some((value) => String(value ?? "").toLowerCase().includes(query)));
	const ranked = [...matching].sort((a, b) => b.descendantCount - a.descendantCount || b.forkCount - a.forkCount || Date.parse(b.created_at) - Date.parse(a.created_at));

	return (
		<main className="min-h-screen bg-background">
			<section className="border-b border-border/70">
				<div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:py-7">
					<div className="space-y-4">
						<div className="max-w-3xl space-y-2">
							<div className="flex items-center gap-3"><h1 className="font-heading text-3xl font-semibold tracking-tight">{t("marketplaceTitle")}</h1><Badge variant="outline" className="rounded-md">{t("marketplaceBeta")}</Badge></div>
							<p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("marketplaceDescription")}</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<Button asChild size="sm" className="h-9 rounded-md"><Link href="/settings/presets">{t("publishPreset")}</Link></Button>
							<form action="/gateway/marketplace" className="relative w-full sm:w-80">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input name="q" defaultValue={q} placeholder={t("searchPresets")} className="h-9 rounded-md pl-10" />
							</form>
						</div>
					</div>
				</div>
			</section>

			<div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
				<section>
					{ranked.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ranked.map((preset) => <PresetProduct key={preset.id} preset={preset} t={t} />)}</div> : <EmptyState query={query} t={t} />}
				</section>
			</div>
		</main>
	);
}

function PresetProduct({ preset, t }: { preset: MarketplacePreset; t: Awaited<ReturnType<typeof getTranslations>> }) {
	return <article className="group flex min-h-48 flex-col rounded-lg border border-border/70 bg-background p-4 transition-colors hover:border-foreground/25 hover:bg-muted/20">
		<div className="flex items-start justify-between gap-3"><Link href={`/gateway/marketplace/${preset.id}`} className="font-heading text-lg font-semibold hover:underline">{preset.name}</Link><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
		<p className="mt-2 line-clamp-2 flex-1 text-sm leading-5 text-muted-foreground">{preset.description ?? t("defaultPresetDescription")}</p>
		<div className="mt-4 border-t border-border/60 pt-3"><Publisher preset={preset} /><div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground"><span className="truncate font-mono">{preset.canonicalModel}</span><span className="ml-3 flex shrink-0 items-center gap-1"><GitFork className="size-3" />{preset.descendantCount}</span></div></div>
	</article>;
}

function Publisher({ preset }: { preset: MarketplacePreset }) { return <Link href={`/gateway/marketplace/publishers/${encodeURIComponent(preset.publisher.handle)}`} className="inline-flex items-center gap-2 text-sm hover:underline"><span className="font-medium">{preset.publisher.displayName}</span><BadgeCheck className="size-3.5 text-muted-foreground" /><span className="text-muted-foreground">@{preset.publisher.handle}</span></Link>; }
function EmptyState({ query, t }: { query: string; t: Awaited<ReturnType<typeof getTranslations>> }) { return <div className="rounded-lg border border-dashed p-12 text-center"><div className="font-heading text-lg font-semibold">{query ? t("noMatchingPresets") : t("marketplaceReady")}</div><p className="mt-2 text-sm text-muted-foreground">{query ? t("tryDifferentPreset") : t("publicPresetsSoon")}</p></div>; }
