import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

const ANNOUNCEMENT_LIMIT = 3;

export function HomeAnnouncementsSectionFallback() {
	return (
		<section className="w-full border-t border-zinc-200/80 pt-12 dark:border-zinc-800/80">
			<div className="space-y-5">
				<div className="mx-auto h-7 w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					{Array.from({ length: ANNOUNCEMENT_LIMIT }).map((_, index) => (
						<div
							key={`announcements-fallback-${index}`}
							className="h-44 animate-pulse rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/70"
						/>
					))}
				</div>
			</div>
		</section>
	);
}

export default async function HomeAnnouncementsSection() {
	const posts = await getAnnouncementPosts();
	const latest = posts.slice(0, ANNOUNCEMENT_LIMIT);

	return (
		<section className="w-full border-t border-zinc-200/80 pt-12 dark:border-zinc-800/80">
			<div className="space-y-6">
				<div className="flex flex-col gap-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Latest announcements
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
						Recent product updates and release notes from local MDX posts.
					</p>
				</div>

				{latest.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
						{latest.map((post) => (
							<Card key={post.slug} className="h-full">
								<CardHeader className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="secondary">
											{formatAnnouncementDate(post.publishedAt)}
										</Badge>
										{post.tags.slice(0, 2).map((tag) => (
											<Badge key={tag} variant="outline">
												{tag}
											</Badge>
										))}
									</div>
									<CardTitle className="text-lg leading-tight">
										<Link
											href={`/announcements/${post.slug}`}
											className="underline decoration-transparent underline-offset-4 transition hover:decoration-current"
										>
											{post.title}
										</Link>
									</CardTitle>
									<CardDescription>{post.description}</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<Link
										href={`/announcements/${post.slug}`}
										className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
									>
										Read
										<ArrowRight className="h-3.5 w-3.5" />
									</Link>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
							No announcements published yet.
						</CardContent>
					</Card>
				)}

				<div className="flex justify-center">
					<Link
						href="/announcements"
						className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
					>
						View all announcements
						<ArrowRight className="h-4 w-4" />
					</Link>
				</div>
			</div>
		</section>
	);
}
