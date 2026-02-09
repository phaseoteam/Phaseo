import { isAdminViewer } from "@/lib/auth/getViewerRole";

type ResolveIncludeHiddenOptions = {
	allowAdminOverride?: boolean;
};

export async function resolveIncludeHidden(
	includeHidden?: boolean,
	options: ResolveIncludeHiddenOptions = {}
): Promise<boolean> {
	if (typeof includeHidden === "boolean") return includeHidden;
	if (!options.allowAdminOverride) return false;
	try {
		return await isAdminViewer();
	} catch {
		return false;
	}
}

export function applyHiddenFilter(query: any, includeHidden: boolean) {
	return includeHidden ? query : query.eq("hidden", false);
}
