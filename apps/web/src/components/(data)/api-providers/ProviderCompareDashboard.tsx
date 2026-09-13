"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Scale, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { APIProviderCard, ProviderModalityKey } from "@/lib/fetchers/api-providers/providerDataTypes";
import { formatLocation } from "@/lib/locations";

const MODALITIES: Array<{ key: ProviderModalityKey; label: string }> = [
	{ key: "text", label: "Text" }, { key: "image", label: "Image" }, { key: "video", label: "Video" },
	{ key: "audio", label: "Audio" }, { key: "embedding", label: "Embeddings" }, { key: "moderation", label: "Moderation" },
];
const compact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
const country = (code: string) => {
	if (!code) return "Not available";
	try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase(); } catch { return code.toUpperCase(); }
};

function ProviderPicker({ providers, selected, onAdd }: { providers: APIProviderCard[]; selected: string[]; onAdd: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger asChild><Button variant="outline" className="h-10 rounded-md border-dashed"><Plus className="size-4" />Add Provider<ChevronsUpDown className="ml-1 size-3.5 text-muted-foreground" /></Button></PopoverTrigger>
		<PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-md p-0">
			<Command><CommandInput placeholder="Search providers" /><CommandList><CommandEmpty>No providers found.</CommandEmpty><CommandGroup>
				{providers.map((provider) => <CommandItem key={provider.api_provider_id} value={`${provider.api_provider_name} ${provider.api_provider_id}`} disabled={selected.includes(provider.api_provider_id)} onSelect={() => { onAdd(provider.api_provider_id); setOpen(false); }} className="rounded-md">
					<span className="relative size-5 shrink-0"><Logo id={provider.api_provider_id} alt="" fill className="object-contain" /></span><span className="min-w-0 flex-1 truncate">{provider.api_provider_name}</span>{selected.includes(provider.api_provider_id) ? <Check className="size-4" /> : null}
				</CommandItem>)}
			</CommandGroup></CommandList></Command>
		</PopoverContent>
	</Popover>;
}

export default function ProviderCompareDashboard({ providers }: { providers: APIProviderCard[] }) {
	const params = useSearchParams();
	const router = useRouter();
	const selectedIds = Array.from(new Set(params.getAll("providers").filter(Boolean))).slice(0, 4);
	const byId = useMemo(() => new Map(providers.map((provider) => [provider.api_provider_id, provider])), [providers]);
	const selected = selectedIds.map((id) => byId.get(id)).filter((provider): provider is APIProviderCard => Boolean(provider));
	const setSelected = (ids: string[]) => { const next = new URLSearchParams(params.toString()); next.delete("providers"); ids.slice(0, 4).forEach((id) => next.append("providers", id)); router.replace(`/api-providers/compare${next.size ? `?${next}` : ""}`); };
	const presets = useMemo(() => {
		const active = [...providers].filter((provider) => provider.active_models > 0);
		return [
			{ title: "Most used", description: "Providers with the highest recent token volume.", items: [...active].sort((a, b) => b.total_monthly_tokens - a.total_monthly_tokens).slice(0, 3) },
			{ title: "Broadest coverage", description: "Providers with the largest active model catalogues.", items: [...active].sort((a, b) => b.active_models - a.active_models).slice(0, 3) },
			{ title: "Multimodal", description: "Providers spanning the most input and output modalities.", items: [...active].sort((a, b) => Object.values(b.modality_support).filter((v) => v.input + v.output > 0).length - Object.values(a.modality_support).filter((v) => v.input + v.output > 0).length).slice(0, 3) },
		].filter((preset) => preset.items.length >= 2);
	}, [providers]);

	return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Scale className="size-5 text-muted-foreground" /><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare Providers</h1></div><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">Compare gateway coverage, modalities, location, and recent usage side by side.</p></div><div className="flex items-center gap-2"><Button asChild variant="ghost" className="rounded-md"><Link href="/api-providers">Browse Providers</Link></Button>{selected.length < 4 ? <ProviderPicker providers={providers} selected={selectedIds} onAdd={(id) => setSelected([...selectedIds, id])} /> : null}</div></div>

		{selected.length === 0 ? <><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{presets.map((preset) => <button key={preset.title} type="button" onClick={() => setSelected(preset.items.map((item) => item.api_provider_id))} className="group flex min-h-40 flex-col rounded-xl border border-border/70 bg-card/40 p-4 text-left transition-colors hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"><div className="flex -space-x-1.5">{preset.items.map((provider) => <span key={provider.api_provider_id} className="relative size-7 rounded-md bg-card ring-2 ring-card"><Logo id={provider.api_provider_id} alt="" fill className="object-contain p-1" /></span>)}</div><h2 className="mt-3 text-sm font-semibold">{preset.title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{preset.description}</p><p className="mt-auto truncate border-t border-border/60 pt-3 text-xs text-muted-foreground group-hover:text-foreground">{preset.items.map((item) => item.api_provider_name).join(" · ")}</p></button>)}</div><div className="mt-8"><ProviderPicker providers={providers} selected={[]} onAdd={(id) => setSelected([id])} /></div></> : <>
			<div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{selected.map((provider) => <div key={provider.api_provider_id} className="relative rounded-xl border border-border/70 bg-card/40 p-4"><Button type="button" size="icon" variant="ghost" className="absolute right-2 top-2 size-8 rounded-md" aria-label={`Remove ${provider.api_provider_name}`} onClick={() => setSelected(selectedIds.filter((id) => id !== provider.api_provider_id))}><X className="size-4" /></Button><Link href={`/api-providers/${provider.api_provider_id}`} className="flex items-center gap-3 pr-8 hover:underline underline-offset-4"><span className="relative size-9 shrink-0"><Logo id={provider.api_provider_id} alt="" fill className="object-contain" /></span><span className="min-w-0"><span className="block truncate font-semibold">{provider.api_provider_name}</span><span className="block truncate font-mono text-xs text-muted-foreground">{provider.api_provider_id}</span></span></Link></div>)}</div>
			<ScrollArea className="mt-8 w-full" scrollBarOrientation="horizontal" keepScrollbarMounted viewportClassName="pb-3"><div className="min-w-[720px] overflow-hidden rounded-xl border border-border/70"><div className="grid bg-muted/25 text-sm" style={{ gridTemplateColumns: `13rem repeat(${selected.length}, minmax(12rem,1fr))` }}><div className="border-b border-r p-3 font-medium">Provider Metric</div>{selected.map((provider) => <div key={provider.api_provider_id} className="border-b border-r p-3 font-medium last:border-r-0">{provider.api_provider_name}</div>)}{[
				["Gateway Models", (p: APIProviderCard) => `${p.active_models.toLocaleString()} active / ${p.total_models.toLocaleString()} total`], ["Free Models", (p: APIProviderCard) => p.free_models ? p.free_models.toLocaleString() : "None"], ["Headquarters", (p: APIProviderCard) => formatLocation(p.country_code, p.subdivision_code) ?? country(p.country_code)], ["Daily Tokens", (p: APIProviderCard) => compact(p.total_daily_tokens)], ["Monthly Tokens", (p: APIProviderCard) => compact(p.total_monthly_tokens)], ["Daily Share", (p: APIProviderCard) => p.daily_share_pct > 0 ? `${p.daily_share_pct.toFixed(2)}%` : "Not available"], ["Input Modalities", (p: APIProviderCard) => MODALITIES.filter(({ key }) => p.modality_support[key]?.input > 0).map((item) => item.label).join(", ") || "None"], ["Output Modalities", (p: APIProviderCard) => MODALITIES.filter(({ key }) => p.modality_support[key]?.output > 0).map((item) => item.label).join(", ") || "None"],
			].flatMap(([label, value]) => [<div key={`${label}-label`} className="border-b border-r bg-background p-3 text-muted-foreground last:border-b-0">{label as string}</div>, ...selected.map((provider) => <div key={`${label}-${provider.api_provider_id}`} className="border-b border-r bg-background p-3 text-sm last:border-r-0">{(value as (p: APIProviderCard) => string)(provider)}</div>)])}</div></div></ScrollArea>
		</>}
	</main>;
}
