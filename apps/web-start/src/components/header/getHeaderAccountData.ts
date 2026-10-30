import "server-only";
import { cache } from "react";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";

// Deduplicate account loading across the header controls within each request.
export const getHeaderAccountData = cache(async (): Promise<InternalAuthHeaderData> => {
    try {
        return await fetchInternalAuthHeaderData({ limit: 50 });
    } catch {
        return { isLoggedIn: false, teams: [] };
    }
});
