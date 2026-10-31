"use client";

import Link from "@/components/link";
import { usePathname } from "@/lib/navigation";
import { useTranslations } from "@/i18n/react";
import ModelCombobox from "../ModelCombobox";
import type { ComparePairLink } from "../ComparePairSummary";
import { pairPath } from "../comparePairs";
import type { CompareModelOption } from "../types";

/** Hand-picked starting points; each opens a normal comparison URL. */
const POPULAR = [
	{ key: "flagships", models: [["openai/gpt-6-astra", "GPT-6 Astra"], ["anthropic/claude-opus-5.5", "Claude Opus 5.5"], ["google/gemini-4-argon", "Gemini 4 Argon"]] },
	{ key: "pairing", models: [["openai/gpt-5", "GPT 5"], ["anthropic/claude-sonnet-4.5", "Claude Sonnet 4.5"]] },
	{ key: "anthropic", models: [["anthropic/claude-opus-5.5", "Claude Opus 5.5"], ["anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5"]] },
	{ key: "openWeights", models: [["google/gemma-4-31b", "Gemma 4 31B"], ["deepseek/deepseek-v4-pro", "DeepSeek V4 Pro"], ["moonshotai/kimi-k3", "Kimi K3"]] },
] as const;

const urlId = (id: string) => id.replace("/", "_");

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
	// Stay on the current locale's compare page.
	const pathname = usePathname();
	return (
		<div className="space-y-8">
			<div className="max-w-2xl">
				<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("emptyTitle")}</h1>
				<p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{t("emptyDescription")}</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				{["first", "second"].map((slot) => (
					<ModelCombobox
						key={slot}
						selectedOptions={selectedOptions}
						selected={[]}
						setSelected={onSelect}
						labelWhenEmpty={slot === "first" ? t("pickFirst") : t("pickSecond")}
						labelWhenSelected={t("pickFirst")}
						showSelectionCount={false}
						className="h-12 w-full justify-start rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
					/>
				))}
			</div>
			<section aria-labelledby="compare-popular" className="space-y-3">
				<h2 id="compare-popular" className="text-sm font-medium text-muted-foreground">{t("popular")}</h2>
				<ul className="grid gap-3 sm:grid-cols-2">
					{POPULAR.map((preset) => (
						<li key={preset.key}>
							<Link
								href={`${pathname}?${preset.models.map(([id]) => `models=${encodeURIComponent(urlId(id))}`).join("&")}`}
								className="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
							>
								<span className="block text-sm font-semibold">{t(`preset.${preset.key}.title` as never)}</span>
								<span className="block text-xs text-muted-foreground">{t(`preset.${preset.key}.description` as never)}</span>
								<span className="mt-3 flex flex-wrap gap-1.5">
									{preset.models.map(([id, name]) => (
										<span key={id} className="rounded-md border border-border px-2 py-0.5 text-xs">{name}</span>
									))}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>
			{pairs.length ? (
				<section aria-labelledby="compare-pairs" className="space-y-3">
					<h2 id="compare-pairs" className="text-sm font-medium text-muted-foreground">{t("headToHead")}</h2>
					<ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
						{pairs.slice(0, 24).map((pair) => {
							const href = pairPath([pair.models[0].id, pair.models[1].id]);
							return (
								<li key={href}>
									<Link href={`${pathname}${href.slice("/compare".length)}`} className="hover:underline">
										{t("pairTitle", { a: pair.models[0].name, b: pair.models[1].name })}
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
