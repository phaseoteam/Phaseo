import type { InternalAuthHeaderData } from "@/app/api/internal/auth/header/route";

export async function fetchClientAuthHeaderData(): Promise<InternalAuthHeaderData> {
	const response = await fetch("/api/internal/auth/header", {
		cache: "no-store",
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch auth header data: ${response.status}`);
	}

	return (await response.json()) as InternalAuthHeaderData;
}
