import { Outlet } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";

export function getInternalLayoutMetadata(): PageMetadata {
	return {
		title: "Internal",
		robots: {
			index: false,
			follow: false,
		},
	};
}

export default function InternalLayout() {
	return <Outlet />;
}
