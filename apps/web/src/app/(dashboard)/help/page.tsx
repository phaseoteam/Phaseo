import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getHelpCategories } from "@/lib/content/helpCenter";

export const metadata: Metadata = {
	title: "Help Center",
	description:
		"Help center articles for account access, MFA, billing, privacy, and developer API support.",
};

export default async function HelpCenterPage() {
	const categories = await getHelpCategories();

	return (
		<div className="container mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
			<section className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 dark:border-zinc-800 dark:bg-zinc-900/40 md:px-8">
				<div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
					<LifeBuoy className="h-4 w-4" />
					<span>Support Resources</span>
				</div>
				<h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
					Help Center
				</h1>
				<p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-700 dark:text-zinc-300">
					Browse support articles for account access, MFA setup, billing,
					security, and API integration troubleshooting.
				</p>
			</section>

			<section className="mt-8">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					{categories.map((category) => (
						<Card key={category.slug} className="h-full">
							<CardHeader>
								<div className="flex items-center justify-between gap-3">
									<CardTitle className="text-xl">{category.title}</CardTitle>
									<Badge variant="secondary">
										{category.articles.length} article
										{category.articles.length === 1 ? "" : "s"}
									</Badge>
								</div>
								<CardDescription>{category.description}</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-2">
									{category.articles.slice(0, 4).map((article) => (
										<li key={article.slug}>
											<Link
												href={`/help/${category.slug}/${article.slug}`}
												className="group inline-flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
											>
												<span>{article.title}</span>
												<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
											</Link>
										</li>
									))}
								</ul>
								<Link
									href={`/help/${category.slug}`}
									className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
								>
									View all in {category.title}
									<ArrowRight className="h-4 w-4" />
								</Link>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
		</div>
	);
}
