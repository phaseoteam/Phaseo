import { fetchPublicWebApi } from "@/lib/web-api/client";

export type ProviderPriority = "critical" | "high" | "medium" | "info";

export type ProviderIncident = {
	id: string;
	title: string;
	link: string;
	status: string;
	impact?: string;
	description?: string;
	updatedAt?: string;
	publishedAt?: string;
	priority?: ProviderPriority;
};

export type ProviderStatus = {
	name: string;
	statusPageUrl: string;
	hasIssues: boolean;
	incidents: ProviderIncident[];
	lastChecked?: string;
	error?: string;
	unsupported?: boolean;
};

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
	return (await fetchPublicWebApi<{ providers: ProviderStatus[] }>("/api/_web/status/providers")).providers;
}
