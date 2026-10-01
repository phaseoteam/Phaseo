import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Common.errors");
	return {
		title: t("notFoundTitle"),
		robots: { index: false, follow: false },
	};
}

export default async function LocaleNotFound() {
	const locale = await getLocale();
	const t = await getTranslations("Common.errors");

	return (
		<main className="flex min-h-dvh items-center justify-center px-4 py-16 sm:px-6">
			<div className="text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("notFoundTitle")}
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{t("notFoundDescription")}
				</p>
				<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
					<Button asChild variant="outline">
						<Link href="/">
							<ArrowLeft className="size-4" aria-hidden="true" />
							{t("goHome")}
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link href="/models" locale={locale}>
							{t("browseModels")}
							<ArrowRight className="size-4" aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
