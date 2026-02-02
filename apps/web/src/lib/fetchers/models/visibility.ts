import { isAdminViewer } from "@/lib/auth/getViewerRole";

export async function resolveIncludeHidden(includeHidden?: boolean): Promise<boolean> {
	if (typeof includeHidden === "boolean") return includeHidden;
	try {
		return await isAdminViewer();
	} catch {
		return false;
	}
}

export function applyHiddenFilter(query: any, includeHidden: boolean) {
	return includeHidden ? query : query.eq("hidden", false);
}
