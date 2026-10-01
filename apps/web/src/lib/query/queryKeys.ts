export type AccountQueryScope = Readonly<{
	userId: string | null;
	workspaceId: string | null;
}>;

export const ANONYMOUS_ACCOUNT_QUERY_SCOPE: AccountQueryScope = {
	userId: null,
	workspaceId: null,
};

export function toAccountQueryScope(input: {
	userId?: string | null;
	workspaceId?: string | null;
}): AccountQueryScope {
	const userId = input.userId?.trim() || null;
	return {
		userId,
		workspaceId: userId ? input.workspaceId?.trim() || null : null,
	};
}

export function hasAuthenticatedAccountQueryScope(
	scope: AccountQueryScope | null | undefined,
): scope is AccountQueryScope & { userId: string } {
	return Boolean(scope?.userId);
}

function stableListKey(values: string[]): string {
	return [...new Set(values.filter(Boolean))].sort().join("\u001f");
}

const root = ["phaseo-web"] as const;
const accountRoot = [...root, "account"] as const;

export const publicQueryPaths = {
	gatewayModels: "/api/gateway/models",
	models:
		"/api/_web/models?limit=2000&offset=0&shape=page&projection=5",
	modelsV2:
		"/api/_web/models?limit=2000&offset=0&shape=page&projection=6&catalogue_version=v2",
	modelsTable:
		"/api/_web/models?limit=10000&offset=0&shape=table&projection=2",
	modelsTableV2:
		"/api/_web/models?limit=10000&offset=0&shape=table&projection=2&catalogue_version=v2",
	search: "/api/_web/search?client-cache=no-browser",
	status: "/api/_web/status",
} as const;

const publicKeys = {
	all: () => [...root, "public"] as const,
	status: () => [...publicKeys.all(), "status"] as const,
	search: () => [...publicKeys.all(), "search"] as const,
	gatewayModels: () => [...publicKeys.all(), "gateway-models"] as const,
	modelPerformance: (args: {
		modelId: string;
		cloudflareColo: string | null;
		percentile: number;
		rangeDays: number;
	}) =>
		[
			...publicKeys.all(),
			"model-performance",
			args.modelId,
			args.cloudflareColo ?? "all",
			args.percentile,
			args.rangeDays,
		] as const,
	modelUsageDaily: (modelId: string) =>
		[...publicKeys.all(), "model-usage-daily", modelId] as const,
	modelPricing: (modelId: string) =>
		[...publicKeys.all(), "model-pricing", modelId] as const,
	modelRuntimeStats: (args: {
		modelId: string;
		providerIds: string[];
		modelAliases: string[];
		percentile: number;
	}) =>
		[
			...publicKeys.all(),
			"model-runtime-stats",
			args.modelId,
			stableListKey(args.providerIds),
			stableListKey(args.modelAliases),
			args.percentile,
		] as const,
};

function accountScopeKey(scope: AccountQueryScope) {
	return [
		...accountRoot,
		"scope",
		scope.userId ?? "anonymous",
		scope.workspaceId ?? "none",
	] as const;
}

const accountKeys = {
	all: () => accountRoot,
	scope: (scope: AccountQueryScope) => accountScopeKey(scope),
	catalogue: (args: {
		scope: AccountQueryScope;
		catalogueVersion: "v1" | "v2";
		previewCacheScope: string;
	}) =>
		[
			...accountScopeKey(args.scope),
			"catalogue",
			args.catalogueVersion,
			args.previewCacheScope,
		] as const,
	privateModels: (args: {
		scope: AccountQueryScope;
		shape: "page" | "table";
	}) => [...accountScopeKey(args.scope), "private-models", args.shape] as const,
	providerPreviews: (args: {
		scope: AccountQueryScope;
		providerSlug?: string;
	}) =>
		[
			...accountScopeKey(args.scope),
			"provider-catalog-previews",
			args.providerSlug ?? "all",
		] as const,
	workspaceSearch: (scope: AccountQueryScope) =>
		[...accountScopeKey(scope), "workspace-search"] as const,
	adminModelPreview: (args: {
		scope: AccountQueryScope;
		modelId: string;
	}) =>
		[...accountScopeKey(args.scope), "admin-model-preview", args.modelId] as const,
};

export const webQueryKeys = {
	public: publicKeys,
	account: accountKeys,
} as const;
