"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BlogRecentPost = {
	slug: string;
	title: string;
	description: string;
	coverImage: string;
	categoryLabel: string;
	isPreview: boolean;
	metaParts: string[];
};

type BlogRecentPostsProps = {
	posts: BlogRecentPost[];
};

const DEFAULT_RECENT_COUNT = 5;
const RECENT_COUNT_STEP = 5;

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
	post: BlogRecentPost;
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

function PostMeta({ post }: { post: BlogRecentPost }) {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
			{post.metaParts.map((part, index) => (
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
		</span>
	);
}

function LatestPostRow({ post }: { post: BlogRecentPost }) {
	return (
		<Link
			href={`/blog/${post.slug}`}
			className="group grid gap-4 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 sm:grid-cols-[14rem_minmax(0,1fr)]"
		>
			<div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900 sm:self-center">
				<PostImage
					post={post}
					className="transition duration-500 group-hover:scale-[1.03]"
				/>
				{post.isPreview ? (
					<div className="absolute left-2 top-2">
						<PreviewBadge />
					</div>
				) : null}
			</div>
			<div className="flex min-w-0 flex-col justify-center gap-3 py-1 sm:py-2">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
					<span>{post.isPreview ? "Preview" : post.categoryLabel}</span>
					<PostMeta post={post} />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold leading-tight tracking-tight text-zinc-950 transition group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
						{post.title}
					</h3>
					<p className="line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
						{post.description}
					</p>
				</div>
				<div className="flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-zinc-50">
					Read post
					<ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
				</div>
			</div>
		</Link>
	);
}

export function BlogRecentPosts({ posts }: BlogRecentPostsProps) {
	const [visiblePostCount, setVisiblePostCount] = useState(DEFAULT_RECENT_COUNT);
	const visiblePosts = posts.slice(0, visiblePostCount);
	const hasMorePosts = visiblePostCount < posts.length;

	return (
		<>
			<div className="space-y-3">
				{visiblePosts.map((post) => (
					<LatestPostRow key={post.slug} post={post} />
				))}
			</div>
			{hasMorePosts ? (
				<div className="flex justify-center pt-2">
					<Button
						type="button"
						variant="outline"
						size="default"
						className="rounded-lg px-4"
						onClick={() =>
							setVisiblePostCount((count) =>
								Math.min(count + RECENT_COUNT_STEP, posts.length)
							)
						}
					>
						Show more
					</Button>
				</div>
			) : null}
		</>
	);
}
