import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
		<section className="w-full">
			<div className="space-y-4">
				<div className="mx-auto h-7 w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
				<div className="grid grid-cols-1 gap-4">
					{Array.from({ length: ANNOUNCEMENT_LIMIT }).map((_, index) => (
						<div
							key={`announcements-fallback-${index}`}
							className="h-36 animate-pulse rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/70"
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
		<section className="w-full">
			<div className="space-y-4">
				<div className="text-center">
					<h2>
						<Link
							href="/announcements"
							className="group inline-flex items-center gap-1 text-center text-3xl font-semibold tracking-[-0.04em] text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200 sm:text-4xl"
						>
							<span>Latest Announcements</span>
							<ChevronRight className="h-5 w-5 shrink-0 translate-y-px opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
						</Link>
					</h2>
				</div>

				{latest.length > 0 ? (
					<div className="grid grid-cols-1 gap-4">
						{latest.map((post) => (
							<Link key={post.slug} href={`/announcements/${post.slug}`} className="block">
								<Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
									<CardHeader className="space-y-1.5 p-4 pb-2">
										<div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
											{formatAnnouncementDate(post.publishedAt)}
										</div>
										<CardTitle className="text-lg leading-snug underline decoration-transparent underline-offset-4 transition hover:decoration-current">
											{post.title}
										</CardTitle>
										<CardDescription className="line-clamp-2 text-sm leading-6">
											{post.description}
										</CardDescription>
									</CardHeader>
									<CardContent className="p-0" />
								</Card>
							</Link>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
							No announcements published yet.
						</CardContent>
					</Card>
				)}

			</div>
		</section>
	);
}
