import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlogRecentPosts } from "./BlogRecentPosts";
import {
	formatAnnouncementDate,
	getAnnouncementPosts,
	isAnnouncementPublished,
	type AnnouncementCategory,
	type AnnouncementSummary,
} from "@/lib/content/announcements";
import { cn } from "@/lib/utils";
import { buildMetadata } from "@/lib/seo";
import { canPreviewFutureBlogPosts } from "@/lib/flags/blogPreview";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

type BlogCategoryFilter = AnnouncementCategory | "all";

type AnnouncementsPageProps = {
	params: Promise<{ locale: PublicLocale }>;
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

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Content.blog");
	return buildMetadata({
		title: t("title"),
		description: t("journalDescription"),
		path: "/blog",
	});
}

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

function isPreviewPost(post: AnnouncementSummary): boolean {
	return !isAnnouncementPublished(post.publishedAt);
}

function PreviewBadge({ label }: { label: string }) {
	return (
		<Badge className="rounded-full border-amber-300 bg-amber-100 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
			{label}
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

function PostDate({ post, locale }: { post: AnnouncementSummary; locale: string }) {
	return <span>{formatAnnouncementDate(post.publishedAt, locale)}</span>;
}

function PinnedPostCard({
	post,
	previewLabel,
	categoryLabel,
	locale,
}: {
	post: AnnouncementSummary;
	previewLabel: string;
	categoryLabel: string;
	locale: string;
}) {
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
						<PreviewBadge label={previewLabel} />
					</div>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-4 p-5">
				<div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
					<span>{preview ? previewLabel : categoryLabel}</span>
					<PostDate post={post} locale={locale} />
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
	params,
}: AnnouncementsPageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.blog" });
	const [posts, resolvedSearchParams] = await Promise.all([
		canPreviewFutureBlogPosts().then((canPreviewFuturePosts) =>
			getAnnouncementPosts({ includeFuture: canPreviewFuturePosts, locale })
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
		categoryLabel: t(`categories.${post.category}`),
		isPreview: isPreviewPost(post),
		metaParts: [
			post.author,
			formatAnnouncementDate(post.publishedAt, locale),
			t("readingTime", { minutes: post.readingTimeMinutes }),
		].filter((part): part is string => Boolean(part)),
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
											{filter.value === "all" ? t("categories.all") : t(`categories.${filter.value}`)}
										</Link>
									</Button>
								);
							})}
						</div>
						<div className="space-y-3">
							<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl lg:text-6xl">
								{t("title")}
							</h1>
						</div>
					</div>
				</header>

				{posts.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
						<p>{t("emptyTitle")}</p>
						<p>{t("emptyDescription")}</p>
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
									{t("pinned")}
								</h2>
							</div>
							<div className="grid gap-4 md:grid-cols-3">
								{pinnedPosts.map((post) => (
									<PinnedPostCard
										key={post.slug}
										post={post}
										previewLabel={t("preview")}
										categoryLabel={t(`categories.${post.category}`)}
										locale={locale}
									/>
								))}
							</div>
						</section>

						<section className="mx-auto max-w-4xl space-y-4">
							<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
										{t("recent")}
									</h2>
								</div>
								{selectedCategory !== "all" ? (
									<Link
										href="/blog"
										className="text-sm font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
									>
										{t("showAll")}
									</Link>
								) : null}
							</div>

							{filteredPosts.length > 0 ? (
								<BlogRecentPosts posts={recentPosts} />
							) : (
								<div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
									{t("emptyCategory")}
								</div>
							)}
						</section>
					</>
				)}
			</div>
		</div>
	);
}
