import { featureOrder } from "@/lib/config/featureLabels";
import type {
	ModelsTableData,
	MonitorModelTableRow,
} from "@/lib/fetchers/models/table-view/types";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";
import { fetchAuthenticatedPrivateModels } from "@/lib/swr/privateModels";

type ModelsCatalogueVersion = "v1" | "v2";

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
	path: string,
	expectedVersion: ModelsCatalogueVersion,
): Promise<ModelsTableData> {
	const firstPage = await publicSWRFetcher<ModelsTableResponse>(path);
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
			return publicSWRFetcher<ModelsTableResponse>(
				`${url.pathname}${url.search}`,
			);
		}),
	);
	for (const page of laterPages) assertTablePage(page, expectedVersion);

	let models = [firstPage, ...laterPages].flatMap((page) => page.models);
	const privateModels = await fetchAuthenticatedPrivateModels<MonitorModelTableRow>("table");
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

export function fetchModelsTableData(path: string): Promise<ModelsTableData> {
	return fetchModelsTableDataForVersion(path, "v1");
}

export function fetchModelsTableDataV2(path: string): Promise<ModelsTableData> {
	return fetchModelsTableDataForVersion(path, "v2");
}
