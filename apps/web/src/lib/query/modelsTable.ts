import { featureOrder } from "@/lib/config/featureLabels";
import type {
	ModelsTableData,
	MonitorModelTableRow,
} from "@/lib/fetchers/models/table-view/types";
import { publicFetcher } from "@/lib/query/publicFetcher";
import { fetchAuthenticatedPrivateModels } from "@/lib/query/privateModels";
import {
	hasAuthenticatedAccountQueryScope,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";

type ModelsCatalogueVersion = "v1" | "v2";

export type ModelsTableQueryOptions = {
	signal?: AbortSignal;
	accountQueryScope?: AccountQueryScope | null;
	accessToken?: string | null;
};

type ModelsTableResponse = {
	models: MonitorModelTableRow[];
	facets?: {
		endpoints?: string[];
		modalities?: string[];
		features?: string[];
		statuses?: string[];
	};
	catalogue_version?: ModelsCatalogueVersion;
	shape?: string;
	total: number;
	limit: number;
	offset: number;
};

function sortFeatures(features: string[]): string[] {
	const order = new Map(featureOrder.map((feature, index) => [feature, index]));
	return [...features].sort((left, right) => {
		const leftIndex = order.get(left);
		const rightIndex = order.get(right);
		if (leftIndex !== undefined || rightIndex !== undefined) {
			if (leftIndex === undefined) return 1;
			if (rightIndex === undefined) return -1;
			return leftIndex - rightIndex;
		}
		return left.localeCompare(right);
	});
}

function assertTablePage(
	page: ModelsTableResponse,
	expectedVersion: ModelsCatalogueVersion,
	requireFacets = false,
): void {
	if (page.catalogue_version !== expectedVersion) {
		throw new Error(
			`Models table API returned catalogue ${page.catalogue_version ?? "unknown"} for ${expectedVersion} request`,
		);
	}
	if (page.shape !== "table") {
		throw new Error("Models table API returned an invalid response shape");
	}
	if (requireFacets && !page.facets) {
		throw new Error("Models table API response did not include filter facets");
	}
}

async function fetchModelsTableDataForVersion(
	path: `/api/_web/${string}`,
	expectedVersion: ModelsCatalogueVersion,
	options: ModelsTableQueryOptions = {},
): Promise<ModelsTableData> {
	const firstPage = await publicFetcher<ModelsTableResponse>(path, {
		signal: options.signal,
	});
	assertTablePage(firstPage, expectedVersion, true);

	const pageSize = Math.max(1, firstPage.limit || 10_000);
	const offsets: number[] = [];
	for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
		offsets.push(offset);
	}
	const laterPages = await Promise.all(
		offsets.map((offset) => {
			const url = new URL(path, "https://phaseo.local");
			url.searchParams.set("offset", String(offset));
			return publicFetcher<ModelsTableResponse>(
				`${url.pathname}${url.search}` as `/api/_web/${string}`,
				{ signal: options.signal },
			);
		}),
	);
	for (const page of laterPages) assertTablePage(page, expectedVersion);

	let models = [firstPage, ...laterPages].flatMap((page) => page.models);
	const privateModels = hasAuthenticatedAccountQueryScope(
		options.accountQueryScope,
	)
		? await fetchAuthenticatedPrivateModels<MonitorModelTableRow>("table", {
				signal: options.signal,
				accessToken: options.accessToken,
				workspaceId: options.accountQueryScope?.workspaceId,
			})
		: [];
	if (privateModels.length > 0) {
		const privateIds = new Set(privateModels.map((model) => model.modelId));
		models = [...privateModels, ...models.filter((model) => !privateIds.has(model.modelId))];
	}
	return {
		models,
		allEndpoints: firstPage.facets?.endpoints ?? [],
		allModalities: firstPage.facets?.modalities ?? [],
		allFeatures: sortFeatures(firstPage.facets?.features ?? []),
		allStatuses: firstPage.facets?.statuses ?? [],
	};
}

export function fetchModelsTableData(
	path: `/api/_web/${string}`,
	options: ModelsTableQueryOptions = {},
): Promise<ModelsTableData> {
	return fetchModelsTableDataForVersion(path, "v1", options);
}

export function fetchModelsTableDataV2(
	path: `/api/_web/${string}`,
	options: ModelsTableQueryOptions = {},
): Promise<ModelsTableData> {
	return fetchModelsTableDataForVersion(path, "v2", options);
}
