import { use } from "react";
import { permanentRedirect } from "@/lib/navigation";

type AnnouncementRedirectPageProps = {
	params: Promise<{ slug: string }>;
};

export default function AnnouncementRedirectPage({
	params,
}: AnnouncementRedirectPageProps) {
	const { slug } = use(params);
	permanentRedirect(`/blog/${slug}`);
}
