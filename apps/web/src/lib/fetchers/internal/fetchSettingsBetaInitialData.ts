import { headers } from "next/headers";
import type { SettingsBetaInitialData } from "@/app/api/internal/settings/beta/initial/route";

export async function fetchSettingsBetaInitialData(): Promise<SettingsBetaInitialData> {
	const requestHeaders = await headers();
	const host =
		requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
	const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3100";

	const response = await fetch(new URL("/api/internal/settings/beta/initial", baseUrl), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: requestHeaders.get("cookie") ?? "",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch beta settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsBetaInitialData;
}
