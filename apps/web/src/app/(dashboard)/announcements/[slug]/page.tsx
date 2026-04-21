import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { ArrowLeft } from "lucide-react";
import remarkGfm from "remark-gfm";
import { announcementMdxComponents } from "@/components/announcements/announcementMdxComponents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	formatAnnouncementDate,
	getAnnouncementParams,
	getAnnouncementPost,
} from "@/lib/content/announcements";
import { buildMetadata } from "@/lib/seo";

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
	const post = await getAnnouncementPost(slug);
	const path = `/announcements/${slug}`;

	if (!post) {
		return buildMetadata({
			title: "Announcement",
			description:
				"Announcement update from AI Stats with release notes, product details, and rollout guidance.",
			path,
		});
	}

	return buildMetadata({
		title: `${post.title} | Announcements`,
		description: post.description,
		path,
		keywords: ["AI Stats announcements", ...post.tags],
	});
}

export default async function AnnouncementPostPage({
	params,
}: AnnouncementPageProps) {
	const { slug } = await params;
	const post = await getAnnouncementPost(slug);

	if (!post) {
		notFound();
	}

	const { content } = await compileMDX({
		source: post.content,
		options: {
			parseFrontmatter: false,
			mdxOptions: {
				remarkPlugins: [remarkGfm],
			},
		},
		components: announcementMdxComponents,
	});

	return (
		<div className="container mx-auto mt-10 mb-20 max-w-7xl px-4 sm:px-6 lg:px-8">
			<article className="mx-auto w-full max-w-5xl space-y-6">
				<Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
					<Link href="/announcements">
						<ArrowLeft className="h-4 w-4" />
						Back to announcements
					</Link>
				</Button>

				<header className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{formatAnnouncementDate(post.publishedAt)}
						</Badge>
						{post.author ? <Badge variant="outline">{post.author}</Badge> : null}
						{post.tags.map((tag) => (
							<Badge key={tag} variant="outline">
								{tag}
							</Badge>
						))}
					</div>
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-4xl">
						{post.title}
					</h1>
					<p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
						{post.description}
					</p>
				</header>

				{post.coverImage ? (
					<img
						src={post.coverImage}
						alt={`${post.title} cover image`}
						className="h-auto w-full rounded-2xl border border-zinc-200 dark:border-zinc-800"
					/>
				) : null}

				<hr className="border-zinc-200 dark:border-zinc-800" />

				<div>{content}</div>
			</article>
		</div>
	);
}
