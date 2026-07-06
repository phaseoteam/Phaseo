import type { Metadata } from "next";
import Link from "next/link";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlogRecentPosts } from "./BlogRecentPosts";
import {
	formatAnnouncementDate,
	formatAnnouncementReadingTime,
	getAnnouncementPosts,
	isAnnouncementPublished,
	type AnnouncementCategory,
	type AnnouncementSummary,
} from "@/lib/content/announcements";
import { cn } from "@/lib/utils";
import { buildMetadata } from "@/lib/seo";
import { canPreviewFutureBlogPosts } from "@/lib/flags/blogPreview";

type BlogCategoryFilter = AnnouncementCategory | "all";

type AnnouncementsPageProps = {
	searchParams?: Promise<{
		category?: string | string[];
	}>;
};

const CATEGORY_FILTERS: Array<{
	value: BlogCategoryFilter;
	label: string;
}> = [
	{
		value: "all",
		label: "All posts",
	},
	{
		value: "announcements",
		label: "Announcements",
	},
	{
		value: "guides",
		label: "Guides",
	},
	{
		value: "data",
		label: "Data",
	},
];

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
	announcements: "Announcement",
	guides: "Guide",
	data: "Data",
};

export const metadata: Metadata = buildMetadata({
	title: "Blog",
	description:
		"Phaseo product announcements, implementation guides, model data updates, and release notes.",
	path: "/blog",
	keywords: [
		"Phaseo blog",
		"Phaseo announcements",
		"model data updates",
		"AI model guides",
		"product release notes",
	],
});

function normalizeCategory(value: string | string[] | undefined): BlogCategoryFilter {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw === "announcements" || raw === "guides" || raw === "data") {
		return raw;
	}

	return "all";
}

function categoryHref(category: BlogCategoryFilter): string {
	return category === "all" ? "/blog" : `/blog?category=${category}`;
}

function getPinnedPosts(posts: AnnouncementSummary[]): AnnouncementSummary[] {
	const pinnedPosts = posts.filter((post) => post.pinned);
	const fallbackPosts = posts.filter((post) => !post.pinned);
	return [...pinnedPosts, ...fallbackPosts].slice(0, 3);
}

function categoryLabel(category: AnnouncementCategory): string {
	return CATEGORY_LABELS[category];
}

function isPreviewPost(post: AnnouncementSummary): boolean {
	return !isAnnouncementPublished(post.publishedAt);
}

function PreviewBadge() {
	return (
		<Badge className="rounded-full border-amber-300 bg-amber-100 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
			Preview
		</Badge>
	);
}

function PostImage({
	post,
	className,
}: {
	post: AnnouncementSummary;
	className?: string;
}) {
	return (
		<img
			src={post.coverImage}
			alt=""
			className={cn("h-full w-full object-cover", className)}
			loading="lazy"
		/>
	);
}

function PostDate({ post }: { post: AnnouncementSummary }) {
	return <span>{formatAnnouncementDate(post.publishedAt)}</span>;
}

function PinnedPostCard({ post }: { post: AnnouncementSummary }) {
	const preview = isPreviewPost(post);

	return (
		<Link
			href={`/blog/${post.slug}`}
			className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
		>
			<div className="relative aspect-[16/9] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
				<PostImage
					post={post}
					className="transition duration-500 group-hover:scale-[1.03]"
				/>
				{preview ? (
					<div className="absolute left-3 top-3">
						<PreviewBadge />
					</div>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-4 p-5">
				<div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
					<span>{preview ? "Preview" : categoryLabel(post.category)}</span>
					<PostDate post={post} />
				</div>
				<div className="space-y-2">
					<h2 className="text-lg font-semibold leading-tight tracking-tight text-zinc-950 transition group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
						{post.title}
					</h2>
					<p className="line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
						{post.description}
					</p>
				</div>
				<div className="mt-auto flex flex-wrap gap-2">
					{post.tags.slice(0, 2).map((tag) => (
						<Badge
							key={tag}
							variant="outline"
							className="rounded-full border-zinc-200 text-[11px] font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
						>
							{tag}
						</Badge>
					))}
				</div>
			</div>
		</Link>
	);
}

export default async function AnnouncementsPage({
	searchParams,
}: AnnouncementsPageProps) {
	const [posts, resolvedSearchParams] = await Promise.all([
		canPreviewFutureBlogPosts().then((canPreviewFuturePosts) =>
			getAnnouncementPosts({ includeFuture: canPreviewFuturePosts })
		),
		searchParams,
	]);
	const selectedCategory = normalizeCategory(resolvedSearchParams?.category);
	const pinnedPosts = getPinnedPosts(posts);
	const filteredPosts =
		selectedCategory === "all"
			? posts
			: posts.filter((post) => post.category === selectedCategory);
	const recentPosts = filteredPosts.map((post) => ({
		slug: post.slug,
		title: post.title,
		description: post.description,
		coverImage: post.coverImage,
		categoryLabel: categoryLabel(post.category),
		isPreview: isPreviewPost(post),
		metaParts: [
			post.author,
			formatAnnouncementDate(post.publishedAt),
			formatAnnouncementReadingTime(post.readingTimeMinutes),
		].filter(Boolean),
	}));

	return (
		<div className="mx-auto mt-10 mb-20 max-w-7xl px-4 sm:px-6 lg:px-8">
			<div className="space-y-10">
				<header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
					<div className="space-y-5">
						<div className="flex flex-wrap gap-2">
							{CATEGORY_FILTERS.map((filter) => {
								const isActive = selectedCategory === filter.value;
								return (
									<Button
										key={filter.value}
										asChild
										variant={isActive ? "default" : "outline"}
										size="default"
										className={cn(
											"rounded-lg px-3 text-[13px] shadow-none",
											!isActive &&
												"border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-50"
										)}
									>
										<Link href={categoryHref(filter.value)}>
											{filter.label}
										</Link>
									</Button>
								);
							})}
						</div>
						<div className="space-y-3">
							<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl lg:text-6xl">
								Phaseo Blog
							</h1>
						</div>
					</div>
				</header>

				{posts.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
						<p>No posts yet.</p>
						<p>New updates will appear here as they are published.</p>
					</div>
				) : (
					<>
						<section className="space-y-4">
							<div className="flex items-center gap-2">
								<Pin
									className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
									aria-hidden="true"
								/>
								<h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
									Pinned posts
								</h2>
							</div>
							<div className="grid gap-4 md:grid-cols-3">
								{pinnedPosts.map((post) => (
									<PinnedPostCard key={post.slug} post={post} />
								))}
							</div>
						</section>

						<section className="mx-auto max-w-4xl space-y-4">
							<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
										Most recent
									</h2>
								</div>
								{selectedCategory !== "all" ? (
									<Link
										href="/blog"
										className="text-sm font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
									>
										Show all posts
									</Link>
								) : null}
							</div>

							{filteredPosts.length > 0 ? (
								<BlogRecentPosts posts={recentPosts} />
							) : (
								<div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
									No posts in this category yet.
								</div>
							)}
						</section>
					</>
				)}
			</div>
		</div>
	);
}
