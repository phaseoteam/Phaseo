import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsBroadcastInitialData } from "@/app/api/internal/settings/broadcast/initial/route";

export async function fetchSettingsBroadcastInitialData(): Promise<SettingsBroadcastInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/broadcast/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch broadcast settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsBroadcastInitialData;
}
