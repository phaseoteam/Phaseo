// lib/fetchers/sources/getAllSources.ts
import { fetchPublicWebApi } from "@/lib/web-api/client";

export interface SourceCard {
    api_provider_id: string;
    api_provider_name: string;
    country_code: string;
}

export async function getAllSources(): Promise<SourceCard[]> {
	const payload = await fetchPublicWebApi<{ sources: SourceCard[] }>(
		"/api/_web/sources",
	);
	return payload.sources;
}

export async function getAllSourcesCached(): Promise<SourceCard[]> {
    return getAllSources();
}
