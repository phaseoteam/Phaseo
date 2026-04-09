import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
	MigrationPost,
	MigrationScreenshotCheckpoint,
} from "@/lib/content/migrations";

function ScreenshotCheckpointCard({
	checkpoint,
}: {
	checkpoint: MigrationScreenshotCheckpoint;
}) {
	return (
		<div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
			<div className="flex items-center gap-2">
				<Camera className="h-4 w-4 text-muted-foreground" />
				<p className="text-sm font-semibold">{checkpoint.title}</p>
			</div>
			<p className="mt-2 text-sm text-muted-foreground">{checkpoint.description}</p>
			<p className="mt-2 rounded bg-background px-2 py-1 text-xs text-muted-foreground">
				Suggested asset path: {checkpoint.suggestedAssetPath}
			</p>
		</div>
	);
}

export function MigrationPostView({ post }: { post: MigrationPost }) {
	return (
		<article className="container mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
			<nav className="flex items-center gap-2 text-sm text-muted-foreground">
				<Link href="/migrate" className="inline-flex items-center gap-1 hover:text-foreground">
					<ArrowLeft className="h-4 w-4" />
					Back to all migration guides
				</Link>
			</nav>

			<header className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{post.sourceLabel}</Badge>
					<Badge variant="outline">{post.readTimeMinutes} min read</Badge>
					<Badge variant="outline">Updated {post.updatedAt}</Badge>
				</div>
				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					{post.title}
				</h1>
				<p className="max-w-3xl text-base leading-7 text-muted-foreground">
					{post.description}
				</p>
			</header>

			<section className="space-y-4">
				<h2 className="text-xl font-semibold">Prerequisites</h2>
				<ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
					{post.prerequisites.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</section>

			<div className="space-y-8">
				{post.sections.map((section) => (
					<section key={section.id} className="space-y-4">
						<h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
						<div className="space-y-3">
							{section.paragraphs.map((paragraph) => (
								<p key={paragraph} className="text-sm leading-7 text-muted-foreground">
									{paragraph}
								</p>
							))}
						</div>

						{section.checklist?.length ? (
							<div className="rounded-xl border border-border/60 p-4">
								<p className="text-sm font-semibold">Checklist</p>
								<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
									{section.checklist.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						) : null}

						{section.codeSnippets?.length ? (
							<div className="space-y-4">
								{section.codeSnippets.map((snippet) => (
									<CodeBlock
										key={`${section.id}-${snippet.label}`}
										label={snippet.label}
										lang={snippet.lang}
										code={snippet.code}
									/>
								))}
							</div>
						) : null}

						{section.screenshots?.length ? (
							<div className="space-y-3">
								<p className="text-sm font-semibold">Screenshot checkpoints</p>
								<div className="grid gap-3 md:grid-cols-2">
									{section.screenshots.map((checkpoint) => (
										<ScreenshotCheckpointCard
											key={`${section.id}-${checkpoint.suggestedAssetPath}`}
											checkpoint={checkpoint}
										/>
									))}
								</div>
							</div>
						) : null}
					</section>
				))}
			</div>

			<section className="space-y-4">
				<h2 className="text-xl font-semibold">Validation Steps</h2>
				<ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-muted-foreground">
					{post.validationSteps.map((step) => (
						<li key={step}>
							<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
								{step}
							</code>
						</li>
					))}
				</ol>
			</section>

			<section className="space-y-4">
				<h2 className="text-xl font-semibold">FAQ</h2>
				<div className="grid gap-3">
					{post.faq.map((faqItem) => (
						<Card key={faqItem.question}>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">{faqItem.question}</CardTitle>
							</CardHeader>
							<CardContent className="pt-0 text-sm leading-7 text-muted-foreground">
								{faqItem.answer}
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="rounded-xl border border-border/60 p-5">
				<p className="text-sm font-semibold">Need a custom migration diff?</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Use the interactive assistant for before/after snippets tailored to your
					current SDK and language.
				</p>
				<div className="mt-4">
					<Button asChild>
						<Link href="/migrate">Open Migration Assistant</Link>
					</Button>
				</div>
			</section>
		</article>
	);
}
