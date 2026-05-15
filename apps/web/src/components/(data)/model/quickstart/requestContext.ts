export type QuickstartSearchParamValue = string | string[] | undefined;

export type QuickstartSearchParams = Record<string, QuickstartSearchParamValue>;

export type QuickstartRequestContext = {
	sort?: string | null;
	dir?: string | null;
};

function getFirstSearchParamValue(value: QuickstartSearchParamValue): string | null {
	if (Array.isArray(value)) {
		return typeof value[0] === "string" ? value[0] : null;
	}
	return typeof value === "string" ? value : null;
}

export function resolveQuickstartRequestContext(
	searchParams?: QuickstartSearchParams | null,
): QuickstartRequestContext {
	if (!searchParams) return {};

	return {
		sort: getFirstSearchParamValue(searchParams.sort),
		dir: getFirstSearchParamValue(searchParams.dir),
	};
}
