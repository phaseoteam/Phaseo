import type { Metadata } from "next";

import CountriesGrid from "@/components/(data)/countries/CountryGrid";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { countrySummariesQuery } from "./page.queries";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.countries");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/countries",
		title: t("title"),
		description: t("description"),
		keywords: ["AI countries", "AI organisations by country", "AI model geography", "AI hubs", "Phaseo"],
	});
}

export default function CountriesPage() {
	const { data: countries } = useSuspenseQuery(countrySummariesQuery());
	const t = useTranslations("Catalogue.countries");

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8 space-y-6">
				<header className="space-y-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<h1 className="font-bold text-xl mb-2 md:mb-0">
							{t("title")}
						</h1>
					</div>
				</header>

				<CountriesGrid countries={countries} />
			</div>
		</main>
	);
}
