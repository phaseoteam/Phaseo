import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MigrationPostView } from "@/components/(migrate)/MigrationPostView";
import { getMigrationPost, getMigrationPosts } from "@/lib/content/migrations";
import { buildMetadata } from "@/lib/seo";

type PageProps = {
	params: Promise<{ slug: string }>;
};

export function generateStaticParams(): Array<{ slug: string }> {
	return getMigrationPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
	const { slug } = await props.params;
	const post = getMigrationPost(slug);
	const path = `/migrate/${slug}`;

	if (!post) {
		return buildMetadata({
			title: "AI Gateway Migration Guide",
			description:
				"Step-by-step migration guidance for moving from existing AI providers and gateways to AI Stats Gateway.",
			path,
		});
	}

	return buildMetadata({
		title: post.seoTitle,
		description: post.description,
		path,
		keywords: post.keywords,
	});
}

export default async function MigrationPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = getMigrationPost(slug);

	if (!post) {
		notFound();
	}

	return <MigrationPostView post={post} />;
}
