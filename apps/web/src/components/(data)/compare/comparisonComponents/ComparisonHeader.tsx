"use client";

import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ComparisonHeader({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const t = useTranslations("Catalogue.compare");
	const title = selectedModels.map((model) => model.name).join(` ${t("versus")} `);
	const description = selectedModels
		.map((model) => t("modelFromProvider", { model: model.name, provider: model.provider.name }))
		.join(", ");

	return (
		<section className="space-y-5">
			<nav className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
				<Link
					href="/"
					className="shrink-0 text-primary underline decoration-transparent underline-offset-2 hover:decoration-current"
				>
					{t("home")}
				</Link>
				<span>/</span>
				<Link
					href="/compare"
					className="shrink-0 text-primary underline decoration-transparent underline-offset-2 hover:decoration-current"
				>
					{t("breadcrumbCompare")}
				</Link>
				<span>/</span>
				<span className="truncate text-foreground">{title}</span>
			</nav>

			<div className="max-w-4xl space-y-3">
				<h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
					{title}
				</h1>
				<p className="text-pretty text-base leading-7 text-muted-foreground">
					{t("comparisonHeaderDescription", { models: description })}
				</p>
			</div>
		</section>
	);
}
