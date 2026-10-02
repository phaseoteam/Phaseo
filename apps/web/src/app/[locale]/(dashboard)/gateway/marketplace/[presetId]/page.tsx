import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, BadgeCheck, Box, CalendarDays, GitFork, Layers3, Route, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import CopyPresetButton from "@/components/(gateway)/marketplace/CopyPresetButton";
import { fetchFrontendMarketplacePresetDetail } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { buildMetadata } from "@/lib/seo";
import { DisplayCalendarDate } from "@/components/display/DisplayValue";

type Props = { params: Promise<{ presetId: string }>; searchParams: Promise<{ version?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { presetId } = await params;
	const t = await getTranslations("Product.gateway");
	return buildMetadata({
		title: `${t("publicPreset")} - ${t("marketplaceTitle")}`,
		description: t("marketplaceDescription"),
		path: `/gateway/marketplace/${presetId}`,
	});
}

export default async function PresetMarketplaceDetailPage({ params, searchParams }: Props) {
	const [{ presetId }, query] = await Promise.all([params, searchParams]);
	const [t, locale] = await Promise.all([
		getTranslations("Product.gateway"),
		getLocale(),
	]);
	const requestedVersion = Number(query.version);
	const detail = await fetchFrontendMarketplacePresetDetail(presetId, Number.isInteger(requestedVersion) && requestedVersion > 0 ? requestedVersion : undefined);
	if (!detail) return <main className="mx-auto min-h-[60vh] max-w-6xl px-5 py-12 sm:px-8"><Link href="/gateway/marketplace" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("backToMarketplace")}</Link><div className="mt-8 rounded-lg border border-dashed p-12 text-center"><h1 className="font-heading text-2xl font-semibold">{t("presetNotAvailable")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("privatePresetDescription")}</p></div></main>;

	const authStatus = await fetchInternalAuthStatus();
	const { preset, sourcePreset, versions } = detail;
	const resolvedVersion = versions.find((version) => version.version_number === requestedVersion) ?? versions[0];
	const config = (preset.config ?? {}) as Record<string, any>;
	const models = Array.isArray(config.models) ? config.models.map(String) : [];
	const providers = Array.isArray(config.provider?.order) ? config.provider.order.map(String) : Array.isArray(config.only_providers) ? config.only_providers.map(String) : [];

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
				<Button asChild variant="ghost" size="sm" className="rounded-md"><Link href="/gateway/marketplace"><ArrowLeft className="size-4" />{t("backToMarketplace")}</Link></Button>

				<div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
					<div className="min-w-0 space-y-10">
						<header className="space-y-5">
							<div className="flex flex-wrap items-center gap-2"><Badge className="rounded-md"><Sparkles className="mr-1 size-3" />{t("publicPreset")}</Badge>{preset.source_preset_id ? <Badge variant="outline" className="rounded-md"><GitFork className="mr-1 size-3" />{t("fork")}</Badge> : null}</div>
							<h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{preset.name}</h1>
							<p className="max-w-3xl text-base leading-7 text-muted-foreground">{preset.description ?? t("defaultPresetDescription")}</p>
							<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><Link href={`/gateway/marketplace/publishers/${encodeURIComponent(preset.publisher.handle)}`} className="flex items-center gap-2 hover:underline"><span className="flex size-8 items-center justify-center rounded-md border bg-muted/30 text-xs font-semibold">{preset.publisher.displayName.slice(0, 2).toUpperCase()}</span><span className="font-medium">{preset.publisher.displayName}</span><BadgeCheck className="size-4 text-muted-foreground" /><span className="text-muted-foreground">@{preset.publisher.handle}</span></Link><span className="flex items-center gap-1.5 text-muted-foreground"><GitFork className="size-4" />{preset.forkCount} {t("forks")} · {preset.descendantCount} {t("descendants")}</span></div>
							{sourcePreset ? <p className="text-sm text-muted-foreground">{t("derivedFrom")} <Link href={`/gateway/marketplace/${sourcePreset.id}`} className="font-medium text-foreground hover:underline">{sourcePreset.name}</Link></p> : null}
						</header>

						<section className="space-y-5">
							<div className="border-b pb-3"><h2 className="font-heading text-xl font-semibold">{t("whatsIncluded")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("includedDescription")}</p></div>
							<div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
								<Feature icon={Layers3} label={t("models")} value={models.length ? `${models.length} ${t("configured")}` : t("workspaceDefault")} />
								<Feature icon={Route} label={t("routing")} value={humanize(config.routing_mode ?? "balanced")} />
								<Feature icon={Box} label={t("providers")} value={providers.length ? `${providers.length} ${t("prioritized")}` : t("anyEligibleProvider")} />
								<Feature icon={ShieldCheck} label={t("responseCache")} value={config.response_caching?.enabled ? `${t("enabled")} · ${config.response_caching.ttl_seconds ?? 300}s` : t("disabled")} />
							</div>
						</section>

						{models.length ? <section className="space-y-4"><h2 className="font-heading text-xl font-semibold">{t("modelCoverage")}</h2><div className="divide-y overflow-hidden rounded-lg border">{models.map((model, index) => <div key={model} className="flex items-center gap-3 px-4 py-3"><span className="flex size-7 items-center justify-center rounded-md border bg-muted/30 text-xs font-medium">{index + 1}</span><span className="font-mono text-sm">{model}</span>{index === 0 ? <Badge variant="secondary" className="ml-auto rounded-md">{t("default")}</Badge> : null}</div>)}</div></section> : null}

						<section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">{t("versionHistory")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("versionDescription")}</p></div></div><div className="flex flex-wrap gap-2">{versions.map((version) => <Button key={version.id} size="sm" variant={resolvedVersion?.id === version.id ? "default" : "outline"} className="rounded-md" asChild><Link href={`/gateway/marketplace/${presetId}?version=${version.version_number}`}>{version.version_label}</Link></Button>)}</div>{resolvedVersion ? <div className="flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><span className="font-medium">{resolvedVersion.version_label}</span>{resolvedVersion.release_notes ? <p className="mt-1 text-muted-foreground">{resolvedVersion.release_notes}</p> : <p className="mt-1 text-muted-foreground">{t("noReleaseNotes")}</p>}</div><span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /><DisplayCalendarDate value={resolvedVersion.created_at} /></span></div> : null}</section>

						<details className="rounded-lg border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("technicalConfiguration")}</summary><Separator /><pre className="max-h-[32rem] overflow-auto p-4 text-xs leading-5 text-muted-foreground">{JSON.stringify(config, null, 2)}</pre></details>
					</div>

					<aside className="space-y-4 lg:sticky lg:top-24">
						<div className="rounded-xl border bg-muted/15 p-5 shadow-sm">
							<div className="font-mono text-xs text-muted-foreground">{t("invokeAs")}</div><div className="mt-2 break-all font-mono text-sm font-medium">{preset.canonicalModel}</div>
							<Separator className="my-5" />
							<div className="space-y-3">{authStatus.signedIn ? <CopyPresetButton sourcePresetId={preset.id} sourceVersionId={resolvedVersion?.id} /> : <Button asChild className="w-full rounded-md"><Link href="/sign-in">{t("signInToFork")}</Link></Button>}<p className="text-xs leading-5 text-muted-foreground">{t("forkNotice")}</p></div>
						</div>
						<div className="rounded-lg border px-4 py-4 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">{t("version")}</span><span className="font-medium">{resolvedVersion?.version_label ?? t("current")}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-muted-foreground">{t("visibility")}</span><span className="font-medium">{t("public")}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-muted-foreground">{t("origin")}</span><span className="font-medium">{preset.source_preset_id ? t("communityFork") : t("original")}</span></div></div>
					</aside>
				</div>
			</div>
		</main>
	);
}

function Feature({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: string }) { return <div className="bg-background p-4"><Icon className="size-4 text-muted-foreground" /><div className="mt-5 text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
function humanize(value: unknown) { return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
