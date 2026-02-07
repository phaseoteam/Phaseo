import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
	getHelpArticle,
	getHelpArticleParams,
	getHelpCategory,
} from "@/lib/content/helpCenter";

type PageProps = {
	params: Promise<{ category: string; slug: string }>;
};

const markdownComponents: Components = {
	h2: (props) => (
		<h2 className="mt-10 text-2xl font-semibold tracking-tight" {...props} />
	),
	h3: (props) => <h3 className="mt-8 text-xl font-semibold tracking-tight" {...props} />,
	p: (props) => (
		<p className="mt-4 text-sm leading-7 text-zinc-700 dark:text-zinc-300" {...props} />
	),
	ul: (props) => (
		<ul
			className="mt-4 list-disc space-y-2 pl-6 text-sm leading-7 text-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	ol: (props) => (
		<ol
			className="mt-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	a: (props) => {
		const href = props.href;
		const isExternal = typeof href === "string" && href.startsWith("http");
		return (
			<a
				{...props}
				className="text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
				target={isExternal ? "_blank" : undefined}
				rel={isExternal ? "noreferrer noopener" : undefined}
			/>
		);
	},
	code: (props) => (
		<code
			{...props}
			className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
		/>
	),
};

function formatUpdated(updated: string | null): string | null {
	if (!updated) {
		return null;
	}
	const parsed = new Date(updated);
	if (Number.isNaN(parsed.getTime())) {
		return updated;
	}
	return parsed.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export async function generateStaticParams(): Promise<
	Array<{ category: string; slug: string }>
> {
	return getHelpArticleParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
	const { category, slug } = await props.params;
	const article = await getHelpArticle(category, slug);

	if (!article) {
		return {
			title: "Help Article",
			description: "Help center article page.",
		};
	}

	return {
		title: article.title,
		description: article.description,
	};
}

export default async function HelpArticlePage({ params }: PageProps) {
	const { category, slug } = await params;
	const [article, categoryData] = await Promise.all([
		getHelpArticle(category, slug),
		getHelpCategory(category),
	]);

	if (!article || !categoryData) {
		notFound();
	}

	const updatedLabel = formatUpdated(article.updated);

	return (
		<div className="container mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/help" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					Help Center
				</Link>
				<ChevronRight className="h-4 w-4" />
				<Link
					href={`/help/${categoryData.slug}`}
					className="hover:text-zinc-900 dark:hover:text-zinc-100"
				>
					{categoryData.title}
				</Link>
				<ChevronRight className="h-4 w-4" />
				<span className="truncate">{article.title}</span>
			</nav>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<article>
					<h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
						{article.title}
					</h1>
					<p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
						{article.description}
					</p>
					{updatedLabel ? (
						<div className="mt-4">
							<Badge variant="secondary">Updated {updatedLabel}</Badge>
						</div>
					) : null}
					<div className="mt-8">
						<ReactMarkdown components={markdownComponents}>
							{article.content}
						</ReactMarkdown>
					</div>
				</article>

				<aside>
					<Card className="p-5">
						<h2 className="text-base font-semibold">More in {categoryData.title}</h2>
						<ul className="mt-4 space-y-2">
							{categoryData.articles.map((relatedArticle) => {
								const isCurrent = relatedArticle.slug === article.slug;
								return (
									<li key={relatedArticle.slug}>
										<Link
											href={`/help/${categoryData.slug}/${relatedArticle.slug}`}
											aria-current={isCurrent ? "page" : undefined}
											className={
												isCurrent
													? "text-sm font-medium text-zinc-950 dark:text-zinc-100"
													: "text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
											}
										>
											{relatedArticle.title}
										</Link>
									</li>
								);
							})}
						</ul>
					</Card>
				</aside>
			</div>
		</div>
	);
}
