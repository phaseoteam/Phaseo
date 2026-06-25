import Link from "next/link";
import Script from "next/script";
import { ArrowRight } from "lucide-react";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import type { MethodologyEntry } from "@/lib/content/methodology";
import { Separator } from "@/components/ui/separator";

export function MethodologyArticlePage({ entry }: { entry: MethodologyEntry }) {
	const articleSchema = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: entry.title,
		description: entry.description,
		datePublished: entry.lastUpdated,
		dateModified: entry.lastUpdated,
		mainEntityOfPage: absoluteUrl(entry.path),
		author: {
			"@type": "Organization",
			name: SITE_NAME,
		},
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
		},
	};

	return (
		<>
			<Script
				id={`methodology-schema-${entry.slug}`}
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
			/>
			<div className="container mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
				<header className="space-y-4">
					<div className="text-sm text-muted-foreground">
						Methodology
					</div>
					<div className="space-y-3">
						<h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
							{entry.title}
						</h1>
						<p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
							{entry.intro}
						</p>
					</div>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						Last updated: {entry.lastUpdated}
					</p>
				</header>

				<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />

				<article className="space-y-8">
					{entry.sections.map((section) => (
						<section
							key={section.heading}
							className="space-y-3 border-t border-zinc-200/70 pt-6 first:border-t-0 first:pt-0 dark:border-zinc-800/70"
						>
							<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
								{section.heading}
							</h2>
							<div className="space-y-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
								{section.paragraphs.map((paragraph) => (
									<p key={paragraph}>{paragraph}</p>
								))}
							</div>
						</section>
					))}
				</article>

				<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />

				<section className="space-y-4">
					<h2 className="text-sm text-muted-foreground">
						Related pages
					</h2>
					<div className="flex flex-col gap-3">
						{entry.relatedLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
							>
								{link.label}
								<ArrowRight className="h-4 w-4" />
							</Link>
						))}
					</div>
				</section>
			</div>
		</>
	);
}
