"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, Link2, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ModelCombobox from "../ModelCombobox";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareModelOption } from "../types";
import { CompareBenchmarks } from "./CompareBenchmarks";
import { CompareGridProvider, MODEL_COLOURS } from "./CompareGrid";
import { CompareSpecTable, CompareVerdicts } from "./CompareOverview";
import { CompareCalculator, ComparePricing } from "./ComparePricing";
import { CompareProviders } from "./CompareProviders";
import { buildVerdicts, visibleOnPhone } from "./compareViewMath";
import type { CompareView as CompareViewData, CompareViewUsageByModel } from "./types";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
	return (
		<button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex h-8 items-center gap-2 text-xs text-muted-foreground">
			<span className={cn("relative h-4 w-7 rounded-[4px] bg-muted-foreground/30 transition-colors", on && "bg-sky-600")} aria-hidden>
				<span className={cn("absolute top-0.5 left-0.5 size-3 rounded-[3px] bg-background transition-transform", on && "translate-x-3")} />
			</span>
			{label}
		</button>
	);
}

const SECTIONS = ["overview", "pricing", "providers", "benchmarks"] as const;

export function CompareView({
	view,
	usage,
	selectedOptions,
	selectedIds,
	onSelectedIdsChange,
}: {
	view: CompareViewData;
	usage: CompareViewUsageByModel;
	selectedOptions: CompareModelOption[];
	selectedIds: string[];
	onSelectedIdsChange: (ids: string[]) => void;
}) {
	const t = useTranslations("Catalogue.compareView");
	const models = view.models;
	const [highlightBest, setHighlightBest] = useState(true);
	const [differencesOnly, setDifferencesOnly] = useState(false);
	const [page, setPage] = useState(0);
	const [copied, setCopied] = useState(false);
	const [compact, setCompact] = useState(false);
	const titleRef = useRef<HTMLDivElement>(null);
	const pages = Math.max(1, Math.ceil(models.length / 2));
	const phonePage = Math.min(page, pages - 1);
	const verdicts = useMemo(() => buildVerdicts(models, usage, view.benchmarks), [models, usage, view.benchmarks]);
	const title = models.map((model) => model.name).join(` ${t("versus")} `);
	const chatModel = models.find((model) => model.providers.length > 0);

	useEffect(() => {
		const node = titleRef.current;
		if (!node || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => setCompact(!entry?.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	};

	return (
		<CompareGridProvider value={{ modelCount: models.length, phonePage, highlightBest, differencesOnly, bestLabel: t("best") }}>
			<div className="space-y-8">
				<div ref={titleRef} className="space-y-3">
					<nav aria-label={t("breadcrumb")} className="text-xs text-muted-foreground">
						<Link href="/compare" className="hover:underline">{t("compare")}</Link>
						<span aria-hidden> / </span>
						<span>{title}</span>
					</nav>
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div className="min-w-0">
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
							<p className="mt-1 text-sm text-muted-foreground">{t("headerSub")}</p>
						</div>
						<div className="flex gap-2">
							<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={copyLink}>
								{copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
								{copied ? t("copied") : t("copyLink")}
							</Button>
							{chatModel ? (
								<Button asChild size="sm" className="rounded-md">
									<Link href={`/chat?model=${encodeURIComponent(chatModel.id)}`}>
										<MessageSquare className="size-4" />
										{t("tryInChat", { name: chatModel.name })}
									</Link>
								</Button>
							) : null}
						</div>
					</div>
				</div>

				<div className="sticky top-[var(--site-header-height,4rem)] z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
					<div className="flex flex-wrap items-center gap-2">
						<ul className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:min-w-0 sm:flex-1 sm:flex-wrap" aria-label={t("selectedModels")}>
							{models.map((model, index) => (
								<li key={model.id} className={cn("min-w-0", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
									<span className="flex h-9 w-full max-w-full items-center gap-2 rounded-md border border-border bg-background pr-1 pl-1.5 text-sm font-medium sm:inline-flex sm:h-8 sm:w-auto">
										<span aria-hidden className="h-4 w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
										<ProviderLogo id={model.lab.id} alt={model.lab.name} size="xxs" className="shrink-0" />
										<Link href={`/models/${model.id}`} className="min-w-0 flex-1 truncate hover:underline">{model.name}</Link>
										<button
											type="button"
											onClick={() => onSelectedIdsChange(selectedIds.filter((id) => id !== model.id))}
											className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:size-6"
											aria-label={t("remove", { name: model.name })}
										>
											<X className="size-3.5" />
										</button>
									</span>
								</li>
							))}
							{models.length < 4 ? (
								<li className={cn(models.length % 2 === 0 && "col-span-2")}>
									<ModelCombobox
										selectedOptions={selectedOptions}
										selected={selectedIds}
										setSelected={onSelectedIdsChange}
										labelWhenSelected={t("addModel")}
										showSelectionCount={false}
										className="h-9 rounded-md border border-dashed border-border sm:h-8"
									/>
								</li>
							) : null}
						</ul>
						{compact ? (
							<nav aria-label={t("sections")} className="hidden gap-1 lg:flex">
								{SECTIONS.map((section) => (
									<a key={section} href={`#${section}`} className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
										{t(`section.${section}` as never)}
									</a>
								))}
							</nav>
						) : null}
						<div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
							<Toggle on={highlightBest} onChange={setHighlightBest} label={t("highlightBest")} />
							<Toggle on={differencesOnly} onChange={setDifferencesOnly} label={t("differencesOnly")} />
						</div>
					</div>
					{pages > 1 ? (
						<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground sm:hidden">
							<button type="button" onClick={() => setPage(Math.max(0, phonePage - 1))} disabled={phonePage === 0} className="inline-flex h-9 items-center gap-1 rounded-md px-2 disabled:opacity-40">
								<ChevronLeft className="size-4" />{t("previous")}
							</button>
							<span aria-live="polite">{t("modelsRange", { from: phonePage * 2 + 1, to: Math.min(models.length, phonePage * 2 + 2), total: models.length })}</span>
							<button type="button" onClick={() => setPage(Math.min(pages - 1, phonePage + 1))} disabled={phonePage >= pages - 1} className="inline-flex h-9 items-center gap-1 rounded-md px-2 disabled:opacity-40">
								{t("next")}<ChevronRight className="size-4" />
							</button>
						</div>
					) : null}
				</div>

				<CompareVerdicts models={models} verdicts={verdicts} />
				<CompareSpecTable models={models} usage={usage} benchmarks={view.benchmarks} />
				<ComparePricing models={models} />
				<CompareCalculator models={models} />
				<CompareProviders models={models} />
				<CompareBenchmarks models={models} benchmarks={view.benchmarks} />
				{pages > 1 ? <p className="text-xs text-muted-foreground sm:hidden">{t("phoneBestNote")}</p> : null}
			</div>
		</CompareGridProvider>
	);
}
