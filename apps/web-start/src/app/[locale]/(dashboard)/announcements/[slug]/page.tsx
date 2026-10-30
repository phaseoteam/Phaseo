import { permanentRedirect } from "next/navigation";

type AnnouncementRedirectPageProps = {
	params: Promise<{ slug: string }>;
};

export default async function AnnouncementRedirectPage({
	params,
}: AnnouncementRedirectPageProps) {
	const { slug } = await params;
	permanentRedirect(`/blog/${slug}`);
}
