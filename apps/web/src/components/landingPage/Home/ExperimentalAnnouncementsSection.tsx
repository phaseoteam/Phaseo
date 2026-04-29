import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
	formatAnnouncementDate,
	getAnnouncementPosts,
} from "@/lib/content/announcements";

export function ExperimentalAnnouncementsSectionFallback() {
	return (
		<section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
			<div className="h-72 animate-pulse rounded-[2rem] bg-zinc-100 dark:bg-zinc-900" />
			<div className="grid gap-3">
				{Array.from({ length: 2 }).map((_, index) => (
					<div
						key={index}
						className="h-34 animate-pulse rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-900"
					/>
				))}
			</div>
		</section>
	);
}

export default async function ExperimentalAnnouncementsSection() {
	const posts = await getAnnouncementPosts();
	const [featured, ...rest] = posts.slice(0, 3);

	if (!featured) {
		return null;
	}

	return (
		<section className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
			<Link
				href={`/announcements/${featured.slug}`}
				className="group rounded-[2rem] border border-zinc-200/80 bg-white p-6 shadow-[0_14px_40px_rgba(24,22,18,0.04)] transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-950/78 dark:hover:border-zinc-700"
			>
				<div className="flex h-full flex-col justify-between gap-6">
					<div className="space-y-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">
							Latest announcement
						</p>
						<h2 className="max-w-xl text-3xl font-semibold tracking-[-0.05em] text-zinc-950 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-300 sm:text-4xl">
							{featured.title}
						</h2>
						<p className="max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
							{featured.description}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<span className="rounded-full border border-zinc-200/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
							{formatAnnouncementDate(featured.publishedAt)}
						</span>
						{featured.tags.slice(0, 2).map((tag) => (
							<span
								key={tag}
								className="rounded-full border border-zinc-200/80 px-3 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-300"
							>
								{tag}
							</span>
						))}
					</div>
				</div>
			</Link>

			<div className="flex h-full flex-col justify-between gap-4">
				<div className="space-y-3">
					<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">
						From the journal
					</p>
					<p className="max-w-md text-sm leading-7 text-zinc-600 dark:text-zinc-300">
						Announcements should feel more editorial than the model updates, so this
						side stays quieter and more text-led.
					</p>
				</div>
				<div className="grid gap-3">
					{rest.map((post) => (
						<Link
							key={post.slug}
							href={`/announcements/${post.slug}`}
							className="group rounded-[1.6rem] border border-zinc-200/80 bg-white px-4 py-4 transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-950/78 dark:hover:border-zinc-700"
						>
							<p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
								{formatAnnouncementDate(post.publishedAt)}
							</p>
							<h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-zinc-950 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-300">
								{post.title}
							</h3>
							<p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
								{post.description}
							</p>
						</Link>
					))}
				</div>
				<Link
					href="/announcements"
					className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
				>
					View all announcements
					<ArrowRight className="h-4 w-4" />
				</Link>
			</div>
		</section>
	);
}
