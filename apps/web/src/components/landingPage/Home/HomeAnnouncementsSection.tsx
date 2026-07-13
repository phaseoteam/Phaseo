import Image from "next/image";
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

const ANNOUNCEMENT_LIMIT = 4;

export function HomeAnnouncementsSectionFallback() {
	return (
		<section className="w-full">
			<div className="space-y-4">
				<div className="mx-auto h-7 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
				<div className="grid grid-cols-1 gap-3">
					{Array.from({ length: ANNOUNCEMENT_LIMIT }).map((_, index) => (
						<div
							key={`announcements-fallback-${index}`}
							className="h-28 animate-pulse rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/70"
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
							href="/blog"
							className="group inline-flex items-center gap-1 text-center text-2xl font-semibold tracking-[-0.04em] text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200 sm:text-3xl"
						>
							<span>Latest from the Blog</span>
							<ChevronRight className="h-5 w-5 shrink-0 translate-y-px opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
						</Link>
					</h2>
				</div>

				{latest.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-xl:mx-auto sm:max-xl:max-w-[38rem] sm:max-xl:gap-3 xl:grid-cols-4">
						{latest.map((post) => (
							<Link key={post.slug} href={`/blog/${post.slug}`} className="block">
								<Card className="h-full gap-0 overflow-hidden rounded-[20px] py-0 sm:max-xl:rounded-2xl [--card-spacing:0px]">
									<div className="relative aspect-[16/9] border-b border-zinc-200/80 bg-zinc-100 sm:max-xl:aspect-[16/8] dark:border-zinc-800 dark:bg-zinc-900">
										<Image
											src={post.coverImage}
											alt=""
											fill
											quality={90}
											sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
											className="object-cover"
										/>
									</div>
									<CardHeader className="space-y-1.5 p-3 sm:max-xl:space-y-1 sm:max-xl:p-2.5">
										<div className="text-xs font-medium text-zinc-500 sm:max-xl:text-[11px] dark:text-zinc-400">
											{formatAnnouncementDate(post.publishedAt)}
										</div>
										<CardTitle className="text-base leading-snug sm:max-xl:text-sm">
											{post.title}
										</CardTitle>
										<CardDescription className="line-clamp-2 text-sm leading-5 sm:max-xl:text-xs sm:max-xl:leading-4">
											{post.description}
										</CardDescription>
									</CardHeader>
								</Card>
							</Link>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
							No blog posts published yet.
						</CardContent>
					</Card>
				)}

			</div>
		</section>
	);
}
