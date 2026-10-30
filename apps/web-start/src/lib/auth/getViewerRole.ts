"use server";

import { cache } from "react";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export const getViewerRole = cache(async (): Promise<string | null> => {
	const status = await fetchInternalAuthStatus();
	return status.signedIn ? status.role ?? null : null;
});

export async function isAdminViewer(): Promise<boolean> {
	return (await getViewerRole()) === "admin";
}
