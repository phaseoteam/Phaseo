import { use } from "react";
import { permanentRedirect } from "@/lib/navigation";

type AnnouncementsRedirectPageProps = {
	searchParams?: Promise<{
		category?: string | string[];
	}>;
};

function normalizeCategory(value: string | string[] | undefined): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw === "announcements" || raw === "guides" || raw === "data") {
		return raw;
	}

	return null;
}

export default function AnnouncementsRedirectPage({
	searchParams,
}: AnnouncementsRedirectPageProps) {
	const resolvedSearchParams = searchParams ? use(searchParams) : undefined;
	const category = normalizeCategory(resolvedSearchParams?.category);

	permanentRedirect(category ? `/blog?category=${category}` : "/blog");
}
