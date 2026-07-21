import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { ArrowLeft } from "lucide-react";
import remarkGfm from "remark-gfm";
import { BlogTableOfContents } from "@/components/announcements/BlogTableOfContents";
import { announcementMdxComponents } from "@/components/announcements/announcementMdxComponents";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	formatAnnouncementDate,
	formatAnnouncementReadingTime,
	getAnnouncementParams,
	getAnnouncementPost,
	isAnnouncementPublished,
} from "@/lib/content/announcements";
import {
	createBlogHeadingsPlugin,
	type BlogTocItem,
} from "@/lib/content/blogToc";
import { canPreviewFutureBlogPosts } from "@/lib/flags/blogPreview";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type AnnouncementPageProps = {
	params: Promise<{ slug: string }>;
};

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
	return getAnnouncementParams();
}

export async function generateMetadata(
	props: AnnouncementPageProps
): Promise<Metadata> {
	const { slug } = await props.params;
	const canPreviewFuturePosts = await canPreviewFutureBlogPosts();
	const post = await getAnnouncementPost(slug, {
		includeFuture: canPreviewFuturePosts,
	});
	const path = `/blog/${slug}`;

	if (!post) {
		return buildMetadata({
			title: "Blog",
			description:
				"Phaseo blog post with release notes, product details, model data, and rollout guidance.",
			path,
		});
	}

	if (!canPreviewFuturePosts && !isAnnouncementPublished(post.publishedAt)) {
		return buildMetadata({
			title: "Blog",
			description:
				"Phaseo blog post with release notes, product details, model data, and rollout guidance.",
			path,
		});
	}

	return buildMetadata({
		title: `${post.title} | Blog`,
		description: post.description,
		path,
		keywords: ["Phaseo blog", ...post.tags],
	});
}

export default async function AnnouncementPostPage({
	params,
}: AnnouncementPageProps) {
	const { slug } = await params;
	const canPreviewFuturePosts = await canPreviewFutureBlogPosts();
	const post = await getAnnouncementPost(slug, {
		includeFuture: canPreviewFuturePosts,
	});

	if (!post) {
		if (!canPreviewFuturePosts) {
			const previewPost = await getAnnouncementPost(slug, {
				includeFuture: true,
			});

			if (previewPost && !isAnnouncementPublished(previewPost.publishedAt)) {
				redirect("/blog");
			}
		}

		notFound();
	}

	if (!canPreviewFuturePosts && !isAnnouncementPublished(post.publishedAt)) {
		notFound();
	}

	const isPreview = !isAnnouncementPublished(post.publishedAt);
	const metaParts = [
		post.author,
		formatAnnouncementDate(post.publishedAt),
		formatAnnouncementReadingTime(post.readingTimeMinutes),
	].filter(Boolean);

	const tocItems: BlogTocItem[] = [];
	const { content } = await compileMDX({
		source: post.content,
		options: {
			parseFrontmatter: false,
			mdxOptions: {
				remarkPlugins: [remarkGfm, createBlogHeadingsPlugin(tocItems)],
			},
		},
		components: announcementMdxComponents,
	});

	return (
		<div className="container mx-auto mt-8 mb-20 max-w-7xl px-4 sm:px-6 lg:px-8">
			<div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-start">
				{tocItems.length ? <BlogTableOfContents items={tocItems} /> : null}

				<article className="w-full max-w-4xl space-y-8 lg:flex-1">
					<Link
						href="/blog"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"-ml-2 w-fit",
						)}
					>
						<ArrowLeft className="h-4 w-4" />
						Back to blog
					</Link>

					<header className="mx-auto max-w-3xl space-y-4 text-center">
						{isPreview ? (
							<div className="flex justify-center">
								<Badge className="rounded-full border-amber-300 bg-amber-100 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
									Preview
								</Badge>
							</div>
						) : null}
						<p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
							{metaParts.map((part, index) => (
								<span key={part} className="inline-flex items-center gap-x-1.5">
									{index > 0 ? (
										<span
											className="inline-block h-[5px] w-[5px] rounded-full bg-zinc-400 align-middle dark:bg-zinc-500"
											aria-hidden="true"
										/>
									) : null}
									<span>{part}</span>
								</span>
							))}
						</p>
						<h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">
							{post.title}
						</h1>
						<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
							{post.description}
						</p>
					</header>

					{post.coverImage ? (
						<div className="mx-auto flex max-w-2xl justify-center">
							<img
								src={post.coverImage}
								alt={`${post.title} cover image`}
								className="h-auto max-h-[320px] max-w-full rounded-lg object-contain"
							/>
						</div>
					) : null}

					<hr className="border-zinc-200 dark:border-zinc-800" />

					<div>{content}</div>
				</article>
			</div>
		</div>
	);
}
