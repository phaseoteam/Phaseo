import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import type { KeyIncidentScope } from "./types";

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown) {
	return { ok: false as const, message: error instanceof Error ? error.message : null };
}

export const previewKeyIncident = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((scope: KeyIncidentScope) => scope)
	.handler(async ({ data: scope }) => {
		await requireInternalAdmin();
		try {
			const { accessToken } = await getServerAccountContext();
			const result = await fetchInternalWebApi<{ keys: number; workspaces: number }>("/api/internal/key-incidents/preview", accessToken, { method: "POST", body: JSON.stringify(scope) });
			return { ok: true as const, ...result };
		} catch (error) {
			return failure(error);
		}
	});

export const applyKeyIncident = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: KeyIncidentScope & { title: string; customerMessage: string; sourceUrl: string | null; confirmLocationId: string; requestId: string }) => input)
	.handler(async ({ data: input }) => {
		await requireInternalAdmin();
		try {
			const { accessToken } = await getServerAccountContext();
			const result = await fetchInternalWebApi<{ incidentId: string; keys: number; workspaces: number; emails: number }>("/api/internal/key-incidents/apply", accessToken, { method: "POST", body: JSON.stringify(input) });
			return { ok: true as const, ...result };
		} catch (error) {
			return failure(error);
		}
	});
