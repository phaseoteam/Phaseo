import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { WorkspacePrivacySettings } from "@/app/api/internal/workspace/privacy-settings/route";

export async function fetchWorkspacePrivacySettings(): Promise<WorkspacePrivacySettings | null> {
	const requestHeaders = await headers();
	const response = await fetch(absoluteUrl("/api/internal/workspace/privacy-settings"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: requestHeaders.get("cookie") ?? "",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch workspace privacy settings: ${response.status}`);
	}

	return (await response.json()) as WorkspacePrivacySettings | null;
}
