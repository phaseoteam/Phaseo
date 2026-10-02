import { Metadata } from "next";
import Image from "next/image";
import { MigrationGuide } from "@/components/(migrate)/MigrationGuide";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.migrate" });
	return buildMetadata({ title: t("title"), description: t("description"), path: "/migrate", keywords: ["AI gateway migration", "migrate to Phaseo"] });
}

export default async function MigratePage({ params }: { params: Promise<{ locale: PublicLocale }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.migrate" });
	return (
		<div className="container mx-auto space-y-8 px-4 py-6 sm:space-y-10 sm:px-6 sm:py-10 lg:px-8">
			<div className="flex flex-col gap-5 rounded-3xl border border-border/70 bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h1>
					<p className="max-w-2xl text-muted-foreground">
						{t("intro")}
					</p>
				</div>
				<div className="flex h-14 w-fit items-center rounded-2xl border border-border/70 bg-muted/30 px-4">
					<Image
						src="/wordmark_light.svg"
						alt="Phaseo"
						width={142}
						height={36}
						className="h-8 w-auto dark:hidden"
						priority
					/>
					<Image
						src="/wordmark_dark.svg"
						alt="Phaseo"
						width={142}
						height={36}
						className="hidden h-8 w-auto dark:block"
						priority
					/>
				</div>
			</div>
			<MigrationGuide />
		</div>
	);
}
