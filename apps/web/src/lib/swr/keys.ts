export const publicSWRKeys = {
	gatewayModels: "/api/gateway/models",
	models: "/api/_web/models?limit=2000&offset=0&shape=page&projection=5",
	modelsV2:
		"/api/_web/models?limit=2000&offset=0&shape=page&projection=6&catalogue_version=v2",
	modelsTable:
		"/api/_web/models?limit=10000&offset=0&shape=table&projection=2",
	modelsTableV2:
		"/api/_web/models?limit=10000&offset=0&shape=table&projection=2&catalogue_version=v2",
	// A fixed new key avoids previously cached one-day browser responses after rollout.
	search: "/api/_web/search?client-cache=no-browser",
	status: "/api/_web/status",
} as const;
