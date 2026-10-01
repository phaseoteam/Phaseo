import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchFrontendModelUpdateCards } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { LatestModelsCarousel } from "./LatestModelsCarousel";
import { getLocale, getTranslations } from "next-intl/server";

const CARD_LIMIT = 10;

export function HomeModelUpdatesSectionFallback() {
	return (
		<section className="w-full">
			<div className="space-y-4">
				<div className="mx-auto flex justify-center">
					<div className="h-7 w-60 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
				</div>
				<div className="flex gap-3 overflow-hidden">
					{Array.from({ length: CARD_LIMIT }).map((_, index) => (
						<div
							key={`model-update-fallback-${index}`}
							className="h-28 min-w-[82%] animate-pulse rounded-[20px] bg-zinc-100 dark:bg-zinc-800 sm:min-w-[calc(50%-0.375rem)] lg:min-w-[calc((100%-1.5rem)/3)]"
						/>
					))}
				</div>
			</div>
		</section>
	);
}

export default async function HomeModelUpdatesSection() {
	const locale = await getLocale();
	const [modelCards, t] = await Promise.all([
		fetchFrontendModelUpdateCards(CARD_LIMIT, false),
		getTranslations({ locale, namespace: "Site.home" }),
	]);

	return (
		<section className="w-full">
			<div className="space-y-4">
				<div className="flex justify-center">
					<h2>
						<Link
							href="/models"
							className="group inline-flex items-center gap-1 text-center text-2xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-3xl"
						>
							<span>{t("latestModels")}</span>
							<ChevronRight className="h-5 w-5 shrink-0 translate-y-px opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
						</Link>
					</h2>
				</div>

				{modelCards.length > 0 ? <LatestModelsCarousel cards={modelCards} /> : null}

					{modelCards.length === 0 ? (
						<Card className="border border-dashed border-zinc-200 bg-white/70 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
							<CardContent className="py-12">
								{t("noModelUpdates")}
							</CardContent>
						</Card>
					) : null}
			</div>
		</section>
	);
}
