import { Suspense } from "react";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import { experimentsCouncilModelsQuery } from "./council.queries";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

export async function getCouncilMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.experimentsCouncil");
	return {
		title: t("title"),
		description: t("description"),
		alternates: { canonical: "/experiments/council" },
	};
}

export default function CouncilPage() {
	const t = useTranslations("Product.experimentsCouncil");
	return (
		<>
			<NoFooterStyle />
			<Suspense fallback={<CouncilPageFallback t={t} />}>
				<CouncilPageContent />
			</Suspense>
		</>
	);
}

function CouncilPageFallback({ t }: { t: ReturnType<typeof useTranslations<"Product.experimentsCouncil">> }) {
	return (
		<div className="flex min-h-0 flex-1 bg-white dark:bg-zinc-950">
			<aside className="hidden w-72 shrink-0 border-r border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950 lg:flex lg:flex-col">
				<div className="px-3 py-3">
					<p className="text-sm font-semibold">{t("title")}</p>
					<p className="text-xs text-zinc-500">{t("chats")}</p>
					<div className="mt-2 h-9 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>
				<div className="px-3 pt-1">
					<p className="mb-2 text-xs font-medium text-zinc-500">{t("recentRuns")}</p>
					<div className="space-y-2">
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
					</div>
				</div>
			</aside>

			<div className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-6 sm:px-6 lg:px-8">
				<div className="w-full space-y-5">
					<div className="space-y-1">
						<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
						<p className="text-sm text-zinc-600 dark:text-zinc-300">
							{t("description")}
						</p>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
						<div className="space-y-4">
							<div className="h-4 w-20 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
							<div className="flex flex-wrap gap-2">
								<div className="h-8 w-28 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
								<div className="h-8 w-24 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
								<div className="h-8 w-24 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
							</div>
							<div className="h-36 rounded-xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40" />
							<div className="h-9 w-36 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function CouncilPageContent() {
	const { data: models } = useSuspenseQuery(experimentsCouncilModelsQuery());
	const initialPresets = buildDefaultCouncilPresets(models.map((model) => model.modelId));
	return (
		<CouncilClient
			models={models}
			initialPresets={initialPresets}
			initialSelectedRunId={null}
		/>
	);
}
