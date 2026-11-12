import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { requestClassifiersFlag } from "@/lib/flags";
import type { SettingsClassifier } from "@/lib/fetchers/internal/settingsTypes";

/** Classifier fields in API units, as built by draftToPayload. */
export type ClassifierPayload = Record<string, unknown>;
export type ClassifierActionError = { ok: false; status: number | null; message: string | null; code: string | null };
export type ClassifierTestResult = {
	labels: Array<{ key: string; value: string; confidence: number | null }>;
	answered: boolean;
	costUsd: number;
	model: string;
	requestId: string | null;
};

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await requestClassifiersFlag().catch(() => false))) throw new WebApiError("/api/account/settings/classifiers", 404);
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError("/api/account/settings/classifiers", 401);
	if (!workspaceId) throw new WebApiError("/api/account/settings/classifiers", 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown): ClassifierActionError {
	if (error instanceof WebApiError) {
		const detail = error.detail ?? null;
		const code = detail && /^[a-z_]+$/.test(detail) ? detail : null;
		return { ok: false, status: error.status, message: code ? null : detail, code };
	}
	return { ok: false, status: null, message: null, code: null };
}

export const createClassifier = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((payload: ClassifierPayload) => payload)
	.handler(async ({ data: payload }) => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<{ classifier: SettingsClassifier }>("/api/account/settings/classifiers", context.accessToken, {
				method: "POST",
				body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }),
			});
			return { ok: true as const, id: result.classifier.id };
		} catch (error) {
			return failure(error);
		}
	});

export const updateClassifier = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: ClassifierPayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		try {
			const context = await account();
			await fetchAccountWebApi(`/api/account/settings/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
				method: "PUT",
				body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }),
			});
			return { ok: true as const, id };
		} catch (error) {
			return failure(error);
		}
	});

export const deleteClassifier = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		try {
			const context = await account();
			await fetchAccountWebApi(`/api/account/settings/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
				method: "DELETE",
				body: JSON.stringify({ workspaceId: context.workspaceId }),
			});
			return { ok: true as const };
		} catch (error) {
			return failure(error);
		}
	});

export const testClassifier = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: {
		classifierId: string | null;
		classifier: { model: unknown; instructions: unknown; dimensions: unknown };
		sample: { prompt: string; response?: string };
	}) => input)
	.handler(async ({ data: input }) => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<ClassifierTestResult>("/api/account/settings/classifiers/test", context.accessToken, {
				method: "POST",
				body: JSON.stringify({ ...input, workspaceId: context.workspaceId }),
			});
			return { ok: true as const, result };
		} catch (error) {
			return failure(error);
		}
	});
