import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	formatAnnouncementDate,
	getAnnouncementPosts,
} from "@/lib/content/announcements";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Announcements",
	description:
		"Official AI Stats announcements, release notes, and security updates.",
	path: "/announcements",
	keywords: [
		"AI Stats announcements",
		"product announcements",
		"release notes",
		"security updates",
	],
});

export default async function AnnouncementsPage() {
	const posts = await getAnnouncementPosts();

	return (
		<div className="container mx-auto mt-10 mb-20 max-w-7xl px-4 sm:px-6 lg:px-8">
			<div className="space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Announcements
					</h1>
					<p className="max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
						Official product announcements, release notes, and security updates
						from AI Stats.
					</p>
				</div>

				{posts.length === 0 ? (
					<Card className="border-dashed">
						<CardContent className="space-y-3 py-8 text-sm text-zinc-600 dark:text-zinc-400">
							<p>No announcements yet.</p>
							<p>New updates will appear here as they are published.</p>
						</CardContent>
					</Card>
				) : (
					<div className="grid grid-cols-1 gap-4">
						{posts.map((post) => (
							<Card
								key={post.slug}
								className="transition hover:-translate-y-0.5 hover:shadow-md"
							>
								<CardHeader className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="secondary">
											{formatAnnouncementDate(post.publishedAt)}
										</Badge>
										{post.tags.slice(0, 3).map((tag) => (
											<Badge
												key={tag}
												variant="outline"
												className="text-zinc-600 dark:text-zinc-300"
											>
												{tag}
											</Badge>
										))}
									</div>
									<CardTitle className="text-xl leading-tight">
										<Link
											href={`/announcements/${post.slug}`}
											className="underline decoration-transparent underline-offset-4 transition hover:decoration-current"
										>
											{post.title}
										</Link>
									</CardTitle>
									<CardDescription className="text-sm leading-6">
										{post.description}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3 pt-0">
									<p className="text-sm leading-7 text-zinc-600 dark:text-zinc-300">
										{post.excerpt}
									</p>
									<Link
										href={`/announcements/${post.slug}`}
										className="inline-flex text-sm font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
									>
										Read announcement
									</Link>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
