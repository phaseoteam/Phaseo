import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export type ContactPersonalization = {
	defaultInternalId: string;
	isAuthenticated: boolean;
	tierLabel: string;
	userEmail: string | null;
};

export async function fetchContactPersonalization(): Promise<ContactPersonalization> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<ContactPersonalization>(`/api/account/settings/contact-personalization${query}`, context.accessToken);
}
