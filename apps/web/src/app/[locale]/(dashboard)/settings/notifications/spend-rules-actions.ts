"use server";

// Server actions for the Spend alerts section of Settings → Notifications (the UI arrives in
// PR 7 of the spend rules stack). They call the web-api routes under
// /api/account/settings/spend-rules, which validate with the same shared module as the control
// API. Payloads use the control API's field names (snake_case, amounts as *_usd or *_nanos).
// Server action errors are masked in production, so failures are returned, not thrown.
import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type {
	SpendRule,
	SpendRuleHistory,
	SpendRulePreview,
	SpendRuleTestResult,
} from "@/components/(gateway)/settings/spend-rules/spendRules";

const BASE = "/api/account/settings/spend-rules" as const;
type AccountPath = `/api/account/${string}`;

/** Rule fields as the control API takes them (see SpendRuleInput / SpendRuleUpdateInput). */
export type SpendRulePayload = Record<string, unknown>;
export type SpendRuleActionError = { ok: false; status: number | null; message: string | null; code: string | null };

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError(BASE, 401);
	if (!workspaceId) throw new WebApiError(BASE, 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

function failure(error: unknown): SpendRuleActionError {
	if (error instanceof WebApiError) {
		const detail = error.detail ?? null;
		// The API's machine-readable error, kept even when detail is its message.
		const code = error.code ?? (detail && /^[a-z_]+$/.test(detail) ? detail : null);
		return { ok: false, status: error.status, message: detail === code ? null : detail, code };
	}
	return { ok: false, status: null, message: null, code: null };
}

function rulePath(id: string, suffix = ""): AccountPath {
	return `${BASE}/${encodeURIComponent(id)}${suffix}`;
}

function refresh(): void {
	revalidatePath("/settings/notifications");
}

export async function createSpendRule(payload: SpendRulePayload): Promise<{ ok: true; rule: SpendRule } | SpendRuleActionError> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ rule: SpendRule }>(BASE, context.accessToken, {
			method: "POST",
			body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true, rule: result.rule };
	} catch (error) {
		return failure(error);
	}
}

export async function updateSpendRule(id: string, payload: SpendRulePayload): Promise<{ ok: true; rule: SpendRule } | SpendRuleActionError> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ rule: SpendRule }>(rulePath(id), context.accessToken, {
			method: "PATCH",
			body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true, rule: result.rule };
	} catch (error) {
		return failure(error);
	}
}

export async function deleteSpendRule(id: string): Promise<{ ok: true } | SpendRuleActionError> {
	try {
		const context = await account();
		await fetchAccountWebApi(rulePath(id), context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true };
	} catch (error) {
		return failure(error);
	}
}

/** Sends the rule's alert now, marked TEST; at most 5 a minute per workspace (429 code rate_limited). */
export async function testSpendRule(id: string): Promise<{ ok: true; result: SpendRuleTestResult } | SpendRuleActionError> {
	try {
		const context = await account();
		const response = await fetchAccountWebApi<{ result: SpendRuleTestResult }>(rulePath(id, "/test"), context.accessToken, {
			method: "POST",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		return { ok: true, result: response.result };
	} catch (error) {
		return failure(error);
	}
}

export async function previewSpendRule(id: string): Promise<{ ok: true; preview: SpendRulePreview } | SpendRuleActionError> {
	try {
		const context = await account();
		const response = await fetchAccountWebApi<{ preview: SpendRulePreview }>(
			`${rulePath(id, "/preview")}?workspaceId=${encodeURIComponent(context.workspaceId)}`,
			context.accessToken,
		);
		return { ok: true, preview: response.preview };
	} catch (error) {
		return failure(error);
	}
}

export async function spendRuleHistory(id: string, page: { limit?: number; offset?: number } = {}): Promise<{ ok: true; history: SpendRuleHistory } | SpendRuleActionError> {
	try {
		const context = await account();
		const query = new URLSearchParams({ workspaceId: context.workspaceId });
		if (page.limit !== undefined) query.set("limit", String(page.limit));
		if (page.offset !== undefined) query.set("offset", String(page.offset));
		const response = await fetchAccountWebApi<{ history: SpendRuleHistory }>(`${rulePath(id, "/history")}?${query}`, context.accessToken);
		return { ok: true, history: response.history };
	} catch (error) {
		return failure(error);
	}
}
