import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Layers3, Rocket } from "lucide-react";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Product.experiments" });
	return {
		title: `${t("title")} - Phaseo`,
		description: t("description"),
		alternates: { canonical: "/experiments" },
	};
}

export default function ExperimentsPage() {
	const t = useTranslations("Product.experiments");
	return (
		<>
			<ShowFooterStyle />
			<main className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
				<div className="mb-8 space-y-2">
					<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
						<FlaskConical className="h-3.5 w-3.5" />
						{t("title")}
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
					<p className="max-w-6xl text-sm text-zinc-600 dark:text-zinc-300 sm:text-base">
						{t("description")}
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Layers3 className="h-5 w-5" />
												{t("council")}
							</CardTitle>
							<CardDescription>
									{t("councilDescription")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link href="/experiments/council">{t("council")}</Link>
							</Button>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Rocket className="h-5 w-5" />
												{t("spawn")}+ (BYOC)
							</CardTitle>
							<CardDescription>
									{t("spawnDescription")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link href="/experiments/spawn">{t("spawn")}</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</main>
		</>
	);
}
