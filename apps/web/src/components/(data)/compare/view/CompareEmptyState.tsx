import Link from "@/components/link";
import { usePathname } from "@/lib/navigation";
import { useTranslations } from "@/i18n/react";
import { Activity, ArrowRight, ChartColumn, CircleDollarSign, Gauge, Server } from "lucide-react";
import { getModalityIcon } from "@/components/(data)/models/Models/modalityIcons";
import { useModalityLabel } from "@/components/(data)/models/Models/useModalityLabel";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { cn } from "@/lib/utils";
import ModelCombobox from "../ModelCombobox";
import type { ComparePairLink } from "../ComparePairSummary";
import { pairPath } from "../comparePairs";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareModelOption } from "../types";
import { MODEL_COLOURS } from "./CompareGrid";

/**
 * Hand-picked starting points, one per kind of model the page compares; each
 * opens a normal comparison URL. Checked against the catalogue on 3 Nov 2026:
 * every model is active and routed.
 */
const POPULAR = [
	{ key: "flagships", type: "text", models: [["openai/gpt-6-astra", "GPT-6 Astra"], ["anthropic/claude-opus-5.5", "Claude Opus 5.5"], ["google/gemini-4-argon", "Gemini 4 Argon"]] },
	{ key: "anthropic", type: "text", models: [["anthropic/claude-opus-5.5", "Claude Opus 5.5"], ["anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5"]] },
	{ key: "openWeights", type: "text", models: [["google/gemma-4-31b", "Gemma 4 31B"], ["deepseek/deepseek-v4-pro", "DeepSeek V4 Pro"], ["moonshotai/kimi-k3", "Kimi K3"]] },
	{ key: "video", type: "video", models: [["google/veo-3.1", "Veo 3.1"], ["spacex-ai/grok-imagine-video-1.5", "Grok Imagine Video 1.5"], ["black-forest-labs/flux-3-video", "FLUX 3 Video"]] },
	{ key: "image", type: "image", models: [["black-forest-labs/flux-2-pro", "Flux 2 Pro"], ["bytedance/seedream-5.0-pro", "Seedream 5.0 Pro"], ["meta/muse-image-1.0", "Muse Image 1.0"]] },
	{ key: "decisions", type: "decisions", models: [["cloudflare/clef", "Clef"], ["baselabs/elephant-1", "Elephant-1"]] },
] as const;

/** What every comparison has, named by the sections themselves. */
const SECTIONS = [
	{ key: "pricing", Icon: CircleDollarSign },
	{ key: "benchmarks", Icon: ChartColumn },
	{ key: "performance", Icon: Gauge },
	{ key: "providers", Icon: Server },
	{ key: "activity", Icon: Activity },
] as const;

const urlId = (id: string) => id.replace("/", "_");
const labOf = (id: string) => id.split("/")[0] ?? id;

export function CompareEmptyState({
	selectedOptions,
	onSelect,
	pairs,
}: {
	selectedOptions: CompareModelOption[];
	onSelect: (ids: string[]) => void;
	pairs: ComparePairLink[];
}) {
	const t = useTranslations("Catalogue.compareView");
	const modalityLabel = useModalityLabel();
	// Stay on the current locale's compare page.
	const pathname = usePathname();
	const slot = (index: 0 | 1) => (
		<div className="flex min-w-0 items-stretch gap-2">
			<span aria-hidden className="w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
			<ModelCombobox
				selectedOptions={selectedOptions}
				selected={[]}
				setSelected={onSelect}
				labelWhenEmpty={index === 0 ? t("pickFirst") : t("pickSecond")}
				labelWhenSelected={t("pickFirst")}
				showSelectionCount={false}
				className="h-12 min-w-0 flex-1 justify-start rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
			/>
		</div>
	);

	return (
		<div className="space-y-10">
			<div className="space-y-5">
				<div className="max-w-2xl">
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("emptyTitle")}</h1>
					<p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{t("emptyDescription")}</p>
				</div>
				<div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
					{slot(0)}
					<span aria-hidden className="hidden text-xs font-medium text-muted-foreground sm:block">{t("versus")}</span>
					{slot(1)}
				</div>
				<ul aria-label={t("comparedSections")} className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
					{SECTIONS.map(({ key, Icon }) => (
						<li key={key} className="inline-flex items-center gap-1.5">
							<Icon aria-hidden className="size-3.5" />
							{t(key)}
						</li>
					))}
				</ul>
			</div>

			<section aria-labelledby="compare-popular" className="space-y-3">
				<h2 id="compare-popular" className="text-sm font-medium text-muted-foreground">{t("popular")}</h2>
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{POPULAR.map((preset) => {
						const TypeIcon = getModalityIcon(preset.type);
						return (
							<li key={preset.key}>
								<Link
									href={`${pathname}?${preset.models.map(([id]) => `models=${encodeURIComponent(urlId(id))}`).join("&")}`}
									className="group flex h-full flex-col rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<span className="flex items-start gap-3">
										<span
											title={modalityLabel(preset.type)}
											className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md", getModalityTone(preset.type).sidebarIconSelectedClassName)}
										>
											<TypeIcon aria-hidden className="size-4" />
											<span className="sr-only">{modalityLabel(preset.type)}</span>
										</span>
										<span className="min-w-0 flex-1">
											<span className="block text-sm font-semibold">{t(`preset.${preset.key}.title` as never)}</span>
											<span className="block text-xs text-muted-foreground">{t(`preset.${preset.key}.description` as never)}</span>
										</span>
										<ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
									</span>
									<span className="mt-4 block space-y-1.5">
										{preset.models.map(([id, name], index) => (
											<span key={id} className="flex min-w-0 items-center gap-2 text-sm">
												<span aria-hidden className="h-4 w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
												<ProviderLogo id={labOf(id)} alt="" size="xxs" className="shrink-0" />
												<span className="truncate">{name}</span>
											</span>
										))}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</section>

			{pairs.length ? (
				<section aria-labelledby="compare-pairs" className="space-y-3">
					<h2 id="compare-pairs" className="text-sm font-medium text-muted-foreground">{t("headToHead")}</h2>
					<ul className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
						{pairs.slice(0, 24).map((pair) => {
							const href = pairPath([pair.models[0].id, pair.models[1].id]);
							return (
								<li key={href}>
									<Link
										href={`${pathname}${href.slice("/compare".length)}`}
										className="group flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										<span aria-hidden className="flex shrink-0 gap-0.5">
											<ProviderLogo id={labOf(pair.models[0].id)} alt="" size="xxs" />
											<ProviderLogo id={labOf(pair.models[1].id)} alt="" size="xxs" />
										</span>
										<span className="truncate group-hover:underline">{t("pairTitle", { a: pair.models[0].name, b: pair.models[1].name })}</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</section>
			) : null}
		</div>
	);
}
