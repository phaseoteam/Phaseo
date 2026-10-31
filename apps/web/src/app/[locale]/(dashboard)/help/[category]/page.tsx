import type { Metadata } from "@/lib/seo/metadataTypes";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { notFound } from "@/lib/navigation";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { helpCategoryQuery } from "../page.functions";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";

type PageProps = {
	params: Promise<{ locale: PublicLocale; category: string }>;
};

export async function generateStaticParams(): Promise<Array<{ category: string }>> {
	const { getHelpCategoryParams } = await import("@/lib/content/helpCenter");
	return getHelpCategoryParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
	const { locale, category } = await props.params;
	// helpCenter reads node:fs; import it only where metadata runs (server).
	const { getLocalizedHelpCategory } = await import("@/lib/content/helpCenter");
	const categoryData = await getLocalizedHelpCategory(locale, category);
	const t = await getTranslations({ locale, namespace: "Content.help" });
	const path = `/help/${category}`;

	if (!categoryData) {
		return buildMetadata({
			title: t("title"),
			description: t("description"),
			path,
		});
	}

	return buildMetadata({
		title: `${categoryData.title} | ${t("title")}`,
		description: categoryData.description,
		path,
	});
}

export default function HelpCategoryPage({ params }: PageProps) {
	const { locale, category } = use(params);
	// Unknown categories 404 in the route loader before rendering.
	const { data: categoryData } = useSuspenseQuery(helpCategoryQuery(locale, category));
	const t = useTranslations("Content.help");

	if (!categoryData) {
		notFound();
	}

	return (
		<div className="container mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/help" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					{t("title")}
				</Link>
				<ChevronRight className="h-4 w-4" />
				<span>{categoryData.title}</span>
			</nav>

			<h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
				{categoryData.title}
			</h1>
			<p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
				{categoryData.description}
			</p>

			<section className="mt-8 grid grid-cols-1 gap-4">
				{categoryData.articles.map((article) => (
					<Link key={article.slug} href={`/help/${categoryData.slug}/${article.slug}`}>
						<Card className="transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
							<CardHeader>
								<CardTitle className="text-xl">{article.title}</CardTitle>
								<CardDescription>{article.description}</CardDescription>
							</CardHeader>
						</Card>
					</Link>
				))}
			</section>
		</div>
	);
}
