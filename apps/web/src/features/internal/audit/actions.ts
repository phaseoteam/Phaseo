import { createServerFn } from "@tanstack/react-start";
import { serverAction } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export interface CreateModelInput {
	modelId: string;
	name: string;
	organisationId?: string | null;
	releaseDate?: string | null;
	retirementDate?: string | null;
	status?: string | null;
	hidden?: boolean;
	inputTypes?: string[];
	outputTypes?: string[];
	replacementModelId?: string | null;
}

export const createModel = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: CreateModelInput) => input)
	.handler(async ({ data: input }): Promise<{ success: boolean; error?: string }> => {
		try {
			const { accessToken } = await getServerAccountContext();
			if (!accessToken) return { success: false, error: "Unauthorized" };
			return await fetchAccountWebApi<{ success: boolean; error?: string }>("/api/account/models", accessToken, { method: "POST", body: JSON.stringify(input) });
		} catch (error) { return { success: false, error: error instanceof Error ? error.message : "Model creation failed" }; }
	});

export interface UpdateModelInput {
	modelId: string;
	name?: string;
	organisationId?: string | null;
	releaseDate?: string | null;
	retirementDate?: string | null;
	announcementDate?: string | null;
	deprecationDate?: string | null;
	status?: string | null;
	hidden?: boolean;
	license?: string | null;
	familyId?: string | null;
	previousModelId?: string | null;
	replacementModelId?: string | null;
	inputTypes?: string[];
	outputTypes?: string[];
}

export const updateModel = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: UpdateModelInput) => input)
	.handler(async ({ data: input }): Promise<{ success: boolean; error?: string }> => {
		try {
			const { accessToken } = await getServerAccountContext();
			if (!accessToken) return { success: false, error: "Unauthorized" };
			return await fetchAccountWebApi<{ success: boolean; error?: string }>(`/api/account/models/${encodeURIComponent(input.modelId)}`, accessToken, { method: "PATCH", body: JSON.stringify(input) });
		} catch (error) { return { success: false, error: error instanceof Error ? error.message : "Model update failed" }; }
	});
