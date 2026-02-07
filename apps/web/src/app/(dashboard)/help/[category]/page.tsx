import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getHelpCategory, getHelpCategoryParams } from "@/lib/content/helpCenter";

type PageProps = {
	params: Promise<{ category: string }>;
};

export async function generateStaticParams(): Promise<Array<{ category: string }>> {
	return getHelpCategoryParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
	const { category } = await props.params;
	const categoryData = await getHelpCategory(category);

	if (!categoryData) {
		return {
			title: "Help Category",
			description: "Help center category page.",
		};
	}

	return {
		title: `${categoryData.title} Help`,
		description: categoryData.description,
	};
}

export default async function HelpCategoryPage({ params }: PageProps) {
	const { category } = await params;
	const categoryData = await getHelpCategory(category);

	if (!categoryData) {
		notFound();
	}

	return (
		<div className="container mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/help" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					Help Center
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
