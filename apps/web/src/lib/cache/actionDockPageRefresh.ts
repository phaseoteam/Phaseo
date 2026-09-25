export type ActionDockCacheScope =
	| "catalogue"
	| "model"
	| "provider"
	| "organisation"
	| "benchmark"
	| "apps"
	| "landing"
	| "rankings"
	| "updates"
	| "pricing"
	| "search";

export type ActionDockPageRefreshTarget = {
	pathname: string;
	scope?: ActionDockCacheScope;
	targetId?: string;
};

const CLIENT_QUERY_KEY_TERMS: Partial<Record<ActionDockCacheScope, readonly string[]>> = {
	search: ["search"],
	benchmark: ["benchmark"],
	apps: ["app"],
	landing: ["landing"],
	rankings: ["ranking"],
	updates: ["update"],
	pricing: ["pricing", "subscription-plans"],
};

export function matchesActionDockPageQueryKey(
	queryKey: readonly unknown[],
	target: ActionDockPageRefreshTarget,
): boolean {
	if (queryKey[0] !== "phaseo-web") return false;
	if (target.scope === "catalogue") {
		return queryKey.includes("catalogue") || queryKey.includes("provider-catalog-previews");
	}
	if (target.scope === "model" && queryKey.includes("provider-catalog-previews")) return true;
	if (target.targetId && queryKey.includes(target.targetId)) return true;
	if (!target.scope) return false;
	return CLIENT_QUERY_KEY_TERMS[target.scope]?.some((term) =>
		queryKey.some((part) => typeof part === "string" && part.toLocaleLowerCase().includes(term)),
	) ?? false;
}

function decodePathSegments(pathname: string): string[] | null {
	if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#") || pathname.includes("\\")) {
		return null;
	}

	try {
		const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
		if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/"))) {
			return null;
		}
		return segments;
	} catch {
		return null;
	}
}

function targetFor(scope: ActionDockCacheScope, pathname: string, targetId?: string): ActionDockPageRefreshTarget {
	return { scope, pathname, ...(targetId ? { targetId } : {}) };
}

export function resolveActionDockPageRefresh(pathname: string): ActionDockPageRefreshTarget | null {
	const segments = decodePathSegments(pathname);
	if (!segments) return null;
	const currentPath = `/${segments.map(encodeURIComponent).join("/")}`;
	const [section, subsection, item] = segments;

	if (segments.length === 0) return targetFor("landing", "/");

	if (section === "models") {
		if (segments.length === 1 || subsection === "table" || subsection === "collections") {
			return targetFor("catalogue", currentPath);
		}
		if (segments.length >= 3) {
			return targetFor("model", currentPath, `${subsection}/${item}`);
		}
	}

	if (section === "rankings") return targetFor("rankings", currentPath);
	if (section === "search") return targetFor("search", currentPath);
	if (section === "updates") return targetFor("updates", currentPath);
	if (section === "pricing" || section === "subscription-plans") return targetFor("pricing", currentPath);
	if (section === "benchmarks") return targetFor("benchmark", currentPath, subsection);
	if (section === "apps") return targetFor("apps", currentPath, subsection);
	if (section === "api-providers") {
		return subsection
			? targetFor("provider", currentPath, subsection)
			: targetFor("catalogue", currentPath);
	}
	if (section === "organisations") {
		return subsection
			? targetFor("organisation", currentPath, subsection)
			: targetFor("catalogue", currentPath);
	}

	if (section === "internal" && subsection === "data") {
		const dataSection = segments[2];
		const dataItem = segments[3];
		if (dataSection === "models") {
			if (dataItem === "edit" && segments.length >= 6) {
				return targetFor("model", currentPath, segments.slice(4).join("/"));
			}
			return targetFor("catalogue", currentPath);
		}
		if (dataSection === "api-providers") {
			return dataItem && dataItem !== "new"
				? targetFor("provider", currentPath, dataItem)
				: targetFor("catalogue", currentPath);
		}
		if (dataSection === "organisations") {
			return dataItem && dataItem !== "new"
				? targetFor("organisation", currentPath, dataItem)
				: targetFor("catalogue", currentPath);
		}
		if (dataSection === "benchmarks") {
			return targetFor("benchmark", currentPath, dataItem && dataItem !== "new" ? dataItem : undefined);
		}
		if (dataSection === "registries") return targetFor("catalogue", currentPath);

		// Internal data tools without a public cache family still benefit from
		// invalidating the active Next.js route.
		return { pathname: currentPath };
	}

	return null;
}
