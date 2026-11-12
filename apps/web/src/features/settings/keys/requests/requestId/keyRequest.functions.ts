// An API key request from the CLI's coding-agent setup, reviewed by the person who made it (cookies + web
// API). Reading never changes the request; Approve and Deny are POST server functions. web-api refuses
// approval from anything but the person's own dashboard session and applies the usual MFA rule.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { webQueryKeys } from "@/lib/query/queryKeys";

export type KeyRequestStatus = "pending" | "approving" | "approved" | "collected" | "denied" | "expired";

export type KeyRequestView = {
	id: string;
	status: KeyRequestStatus;
	workspaceId: string;
	workspaceName: string;
	keyName: string;
	agent: string | null;
	clientName: string;
	phaseoApp: boolean;
	requestedVia: "oauth" | "management_key";
	dailyCostNanos: number;
	monthlyCostNanos: number;
	keyLifetimeDays: number;
	createdAt: string;
	expiresAt: string;
	decidedAt: string | null;
	keyId: string | null;
	canApprove: boolean;
};

export type KeyRequestResult =
	| { kind: "ok"; request: KeyRequestView }
	| { kind: "notFound" }
	| { kind: "unauthorized" };

/** What the page showed. web-api refuses to approve if the stored request differs. */
export type ShownKeyRequest = Pick<KeyRequestView, "keyName" | "dailyCostNanos" | "monthlyCostNanos" | "keyLifetimeDays">;

export type KeyRequestDecision =
	| { ok: true; status: KeyRequestStatus }
	| { ok: false; error: string; status?: KeyRequestStatus };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function accessToken(): Promise<string | null> {
	const { getServerAccountContext } = await import("@/lib/fetchers/internal/serverAccountContext");
	return (await getServerAccountContext()).accessToken;
}

const loadKeyRequest = createServerFn({ method: "GET" })
	.validator((id: string) => String(id))
	.handler(async ({ data: id }): Promise<KeyRequestResult> => {
		if (!UUID_PATTERN.test(id)) return { kind: "notFound" };
		const { fetchAccountWebApi, WebApiError } = await import("@/lib/web-api/client");
		const token = await accessToken();
		if (!token) return { kind: "unauthorized" };
		try {
			const body = await fetchAccountWebApi<{ request: KeyRequestView }>(`/api/account/settings/keys/requests/${encodeURIComponent(id)}`, token);
			return { kind: "ok", request: body.request };
		} catch (error) {
			if (error instanceof WebApiError && error.status === 404) return { kind: "notFound" };
			if (error instanceof WebApiError && error.status === 401) return { kind: "unauthorized" };
			throw error;
		}
	});

export const keyRequestQuery = (id: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-key-request", id],
		queryFn: () => loadKeyRequest({ data: id }),
	});

async function decide(id: string, action: "approve" | "deny", body: Record<string, unknown>): Promise<KeyRequestDecision> {
	if (!UUID_PATTERN.test(id)) return { ok: false, error: "not_found" };
	const { fetchAccountWebApi, WebApiError } = await import("@/lib/web-api/client");
	const token = await accessToken();
	if (!token) return { ok: false, error: "unauthorized" };
	try {
		const result = await fetchAccountWebApi<{ status: KeyRequestStatus }>(`/api/account/settings/keys/requests/${encodeURIComponent(id)}/${action}`, token, {
			method: "POST",
			body: JSON.stringify(body),
		});
		return { ok: true, status: result.status };
	} catch (error) {
		if (error instanceof WebApiError) return { ok: false, error: error.code ?? `http_${error.status}` };
		throw error;
	}
}

export const approveKeyRequestAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; shown: ShownKeyRequest }) => input)
	.handler(async ({ data }) => decide(String(data.id), "approve", { shown: data.shown }));

export const denyKeyRequestAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string }) => input)
	.handler(async ({ data }) => decide(String(data.id), "deny", {}));
