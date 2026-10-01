import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { isCatalogLocale, type RuntimeLocale } from "@/i18n/locales";

export default async function UpdatesLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale: localeValue } = await params;
	const locale: RuntimeLocale = isCatalogLocale(localeValue)
		? localeValue
		: "en-GB";
	const t = await getTranslations({ locale, namespace: "Catalogue.updates" });

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex-1 px-4 py-4">
				<div className="mt-6 space-y-3">
					<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-4xl">
						{t("heading")}
					</h1>
				</div>

				<div className="my-4">{children}</div>
			</div>
		</main>
	);
}
