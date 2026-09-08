import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchAuthenticatedPrivateModels<T>(shape: "page" | "table"): Promise<T[]> {
	try {
		const payload = await fetchAccountWebApi<{ private_catalogue?: boolean; models?: T[] }>(
			`/api/account/private-models/catalog?shape=${shape}`,
			await getBrowserAccessToken(),
		);
		return payload.private_catalogue === true && Array.isArray(payload.models) ? payload.models : [];
	} catch {
		// The public catalogue is also used signed out. Authentication failures are
		// expected there and must not make the catalogue unavailable.
		return [];
	}
}
