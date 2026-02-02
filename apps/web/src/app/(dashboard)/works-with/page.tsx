import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import apps from "@/data/works-with-ai-stats.json";

export const metadata: Metadata = {
	title: "Works with AI Stats",
	description: "Apps and integrations built with the AI Stats Gateway.",
};

type WorksWithApp = {
	name: string;
	description: string;
	url: string;
	docs?: string;
	tags: Array<"chat" | "coding" | "productivity" | "creative" | "research" | "other">;
	open_source?: string;
	date_added: string;
	logo?: string;
};

const TAG_LABELS: Record<WorksWithApp["tags"][number], string> = {
	chat: "Chat",
	coding: "Coding",
	productivity: "Productivity",
	creative: "Creative",
	research: "Research",
	other: "Other",
};

const sortedApps = (apps as WorksWithApp[]).slice().sort((a, b) => {
	return b.date_added.localeCompare(a.date_added);
});

function LogoFallback({ name }: { name: string }) {
	const initials = name
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-700">
			{initials || "AI"}
		</div>
	);
}

export default function WorksWithPage() {
	return (
		<section className="container mx-auto flex flex-1 flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
			<div className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
						Works with AI Stats
					</h1>
					<Badge variant="outline">Community</Badge>
				</div>
				<p className="max-w-3xl text-base text-zinc-600 dark:text-zinc-300">
					Discover apps, tools, and integrations that use the AI Stats Gateway. Teams can
					build on top of AI Stats for routing, pricing, and model access, while users bring
					their own AI Stats API keys.
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<Button asChild>
						<Link href="#contributing">Submit your app</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/contribute">Contribute to AI Stats</Link>
					</Button>
				</div>
			</div>

			{sortedApps.length === 0 ? (
				<Card className="border-dashed">
					<CardHeader>
						<CardTitle>No apps yet</CardTitle>
						<CardDescription>
							This list is ready for community submissions. Be the first to add yours.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="#contributing">Add your app</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
					{sortedApps.map((app) => (
						<Card key={`${app.name}-${app.url}`} className="flex h-full flex-col">
							<CardHeader className="space-y-3">
								<div className="flex items-center gap-3">
									{app.logo ? (
										<div className="relative h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-white">
											<Image
												src={app.logo}
												alt={`${app.name} logo`}
												fill
												className="object-contain p-1"
												sizes="48px"
											/>
										</div>
									) : (
										<LogoFallback name={app.name} />
									)}
									<div>
										<CardTitle className="text-lg">{app.name}</CardTitle>
										<CardDescription className="text-xs">
											Added {app.date_added}
										</CardDescription>
									</div>
								</div>
								<CardDescription className="text-sm text-zinc-600 dark:text-zinc-300">
									{app.description}
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-auto space-y-4">
								<div className="flex flex-wrap gap-2">
									{app.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{TAG_LABELS[tag]}
										</Badge>
									))}
								</div>
								<div className="flex flex-wrap gap-2">
									<Button size="sm" asChild>
										<Link href={app.url} target="_blank" rel="noreferrer">
											Visit site
										</Link>
									</Button>
									{app.docs ? (
										<Button size="sm" variant="outline" asChild>
											<Link href={app.docs} target="_blank" rel="noreferrer">
												Setup docs
											</Link>
										</Button>
									) : null}
									{app.open_source ? (
										<Button size="sm" variant="ghost" asChild>
											<Link href={app.open_source} target="_blank" rel="noreferrer">
												Open source
											</Link>
										</Button>
									) : null}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Card id="contributing" className="border-zinc-200/80 bg-white">
				<CardHeader>
					<CardTitle>Contributing</CardTitle>
					<CardDescription>
						Add your app to the Works with AI Stats list by following the steps below.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6 text-sm text-zinc-700">
					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">Requirements</h3>
						<ul className="list-disc space-y-1 pl-5">
							<li>Use AI Stats for AI model access.</li>
							<li>Allow users to bring their own AI Stats API key.</li>
							<li>Be publicly accessible (or have a public landing page).</li>
							<li>Have a logo image.</li>
						</ul>
					</div>

					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">How to submit</h3>
						<ol className="list-decimal space-y-2 pl-5">
							<li>Fork this repository.</li>
							<li>
								Add your app entry to{" "}
								<code className="rounded bg-zinc-100 px-1 py-0.5">apps/web/src/data/works-with-ai-stats.json</code>.
							</li>
							<li>
								Add your logo to{" "}
								<code className="rounded bg-zinc-100 px-1 py-0.5">apps/web/public/works-with-ai-stats/&lt;your-app-name&gt;/logo.png</code>.
							</li>
							<li>Submit a pull request.</li>
						</ol>
					</div>

					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">Entry format</h3>
						<pre className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800">
{`{
  "name": "Your App Name",
  "description": "A brief description of your app (1-2 sentences, max 300 characters)",
  "url": "https://your-app-url.com",
  "docs": "https://your-app-url.com/docs/ai-stats",
  "tags": ["chat"],
  "open_source": "https://github.com/you/your-app",
  "date_added": "2026-01-28",
  "logo": "/works-with-ai-stats/your-app-name/logo.png"
}`}
						</pre>
					</div>

					<div className="space-y-2">
						<h3 className="text-base font-semibold text-zinc-900">Valid tags</h3>
						<div className="flex flex-wrap gap-2">
							{Object.entries(TAG_LABELS).map(([tag, label]) => (
								<Badge key={tag} variant="outline">
									{label}
								</Badge>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<h3 className="text-base font-semibold text-zinc-900">Questions?</h3>
						<p>
							Open an issue if you have questions or need help with your submission.
						</p>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}

