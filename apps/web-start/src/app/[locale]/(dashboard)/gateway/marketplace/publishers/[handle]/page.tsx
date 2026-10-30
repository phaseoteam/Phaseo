import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, BadgeCheck, GitFork } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { fetchFrontendMarketplacePresets } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default async function MarketplacePublisherPage({ params }: { params: Promise<{ handle: string }> }) {
	const { handle } = await params;
	const t = await getTranslations("Product.gateway");
	const normalizedHandle = decodeURIComponent(handle).trim().toLowerCase();
	const marketplacePresets = await fetchFrontendMarketplacePresets();
	const matchedPublisher = marketplacePresets.find((preset) => preset.publisher.handle.toLowerCase() === normalizedHandle || preset.publisher.aliases?.some((alias) => alias.toLowerCase() === normalizedHandle))?.publisher;
	if (matchedPublisher && matchedPublisher.handle.toLowerCase() !== normalizedHandle) redirect(`/gateway/marketplace/publishers/${encodeURIComponent(matchedPublisher.handle)}`);
	const presets = marketplacePresets.filter((preset) => preset.publisher.handle.toLowerCase() === normalizedHandle);
	if (!presets.length) notFound();
	const publisher = presets[0]!.publisher;

	return <main className="min-h-screen bg-background">
		<div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
			<Button asChild variant="ghost" size="sm" className="rounded-md"><Link href="/gateway/marketplace"><ArrowLeft className="size-4" />{t("backToMarketplace")}</Link></Button>
			<header className="mt-8 border-b border-border/70 pb-8">
				<div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-md border bg-muted/30 font-heading text-sm font-semibold">{publisher.displayName.slice(0, 2).toUpperCase()}</span><div><div className="flex items-center gap-2"><h1 className="font-heading text-3xl font-semibold">{publisher.displayName}</h1><BadgeCheck className="size-5 text-muted-foreground" /></div><p className="mt-1 text-sm text-muted-foreground">@{publisher.handle} · {presets.length} {t("publisherPresets")}</p></div></div>
			</header>
			<section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{presets.map((preset) => <article key={preset.id} className="flex min-h-48 flex-col rounded-lg border border-border/70 p-4 transition-colors hover:border-foreground/25 hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><Link href={`/gateway/marketplace/${preset.id}`} className="font-heading text-lg font-semibold hover:underline">{preset.name}</Link><ArrowRight className="size-4 text-muted-foreground" /></div><p className="mt-2 line-clamp-2 flex-1 text-sm leading-5 text-muted-foreground">{preset.description ?? t("defaultPresetDescription")}</p><div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground"><span className="truncate font-mono">{preset.canonicalModel}</span><span className="ml-3 flex shrink-0 items-center gap-1"><GitFork className="size-3" />{preset.descendantCount}</span></div></article>)}
			</section>
		</div>
	</main>;
}
