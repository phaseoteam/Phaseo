import { use } from "react";
import { permanentRedirect } from "next/navigation";

type AnnouncementRedirectPageProps = {
	params: Promise<{ slug: string }>;
};

export default function AnnouncementRedirectPage({
	params,
}: AnnouncementRedirectPageProps) {
	const { slug } = use(params);
	permanentRedirect(`/blog/${slug}`);
}
