import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Languages } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthLocalisationPreview } from "@/components/internal/localisation/AuthLocalisationPreview";
import { Spinner } from "@/components/ui/spinner";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { appleAppStoreLocales } from "@/i18n/apple-locales";
import { getTypedCatalogMessages } from "@/i18n/catalogs";
import {
	catalogLocales,
	getLocaleDefinition,
	isCatalogLocale,
} from "@/i18n/routing";

type LocalisationPreviewPageProps = {
	params: Promise<{ previewLocale: string }>;
};

export async function generateMetadata({ params }: LocalisationPreviewPageProps): Promise<Metadata> {
	const { previewLocale } = await params;
	if (!isCatalogLocale(previewLocale)) return {};
	const t = await getTranslations({ locale: previewLocale, namespace: "Product.internalTools" });
	return {
		title: t("localisationPreviewTitle"),
		description: t("localisationPreviewDescription"),
		robots: { index: false, follow: false },
	};
}

export function generateStaticParams(): Array<{ previewLocale: string }> {
	return catalogLocales.map((previewLocale) => ({ previewLocale }));
}

export default function LocalisationPreviewPage(
	props: LocalisationPreviewPageProps,
) {
	return (
		<Suspense
			fallback={
				<div className="grid min-h-[60vh] place-items-center">
					<Spinner className="size-5 text-muted-foreground" />
				</div>
			}
		>
			<LocalisationPreviewContent {...props} />
		</Suspense>
	);
}

async function LocalisationPreviewContent({
	params,
}: LocalisationPreviewPageProps) {
	await requireInternalAdmin("/internal");
	const { previewLocale: requestedLocale } = await params;
	if (!isCatalogLocale(requestedLocale)) notFound();

	const locale = requestedLocale;
	const t = await getTranslations({ locale, namespace: "Product.internalTools.localisationPreview" });
	const definition = getLocaleDefinition(locale);
	const messages = getTypedCatalogMessages(locale);
	const appleLocaleCount = catalogLocales.filter(
		(candidate) => getLocaleDefinition(candidate).role !== "pseudo",
	).length;

	return (
		<div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
			<header className="space-y-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Languages className="size-4" aria-hidden="true" />
					{t("draftPreviewTitle")}
				</div>
				<div className="space-y-2">
					<h1 className="text-3xl font-bold">{definition.nativeName}</h1>
					<p className="max-w-3xl text-muted-foreground">
						{t("description")}
					</p>
				</div>
				<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
					<span className="rounded-full border px-2.5 py-1">
						{locale}
					</span>
					<span className="rounded-full border px-2.5 py-1">
						{t(`reviewStates.${definition.reviewState}` as never)}
					</span>
					<span className="rounded-full border px-2.5 py-1">
						{definition.dir.toUpperCase()}
					</span>
					<span className="rounded-full border px-2.5 py-1">
						{t("appleLocaleCoverage", { covered: appleLocaleCount, total: appleAppStoreLocales.length })}
					</span>
				</div>
			</header>

			<nav
				aria-label={t("localeNavigation")}
				className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
			>
				{catalogLocales.map((candidate) => {
					const candidateDefinition = getLocaleDefinition(candidate);
					const selected = candidate === locale;
					return (
						<Link
							key={candidate}
							href={`/internal/localisation-preview/${candidate}`}
							aria-current={selected ? "page" : undefined}
							className={
								selected
									? "rounded-lg border border-foreground bg-foreground px-3 py-2 text-sm text-background"
									: "rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
							}
						>
							<bdi
								lang={candidate}
								dir={candidateDefinition.dir}
								className="font-medium"
							>
								{candidateDefinition.nativeName}
							</bdi>
							<bdi dir="ltr" className="ms-2 opacity-70">
								{candidate}
							</bdi>
						</Link>
					);
				})}
			</nav>

			<section
				lang={locale}
				dir={definition.dir}
				className="rounded-2xl border bg-muted/20 p-4 sm:p-8"
			>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<AuthLocalisationPreview />
				</NextIntlClientProvider>
			</section>
		</div>
	);
}
