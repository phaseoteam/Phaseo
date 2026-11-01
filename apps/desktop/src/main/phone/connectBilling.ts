/**
 * Phaseo Connect's billing state, from the website's account routes the desktop already signs in to (Bearer: the
 * Phaseo login's access token). The relay checks entitlement itself; this is what Settings → Phone shows and switches.
 *
 *   GET  {root}/api/account/settings/connect?workspace_id=…
 *   POST {root}/api/account/settings/connect   { workspace_id, enabled }
 */
export type ConnectBilling = {
	enabled: boolean;
	/** False while a finished month is unpaid: Connect is off until it is. */
	paidUp: boolean;
	daysOn: number;
	estimatedNanos: number;
	workspaceName?: string;
};
export type ConnectBillingClient = { read: () => Promise<ConnectBilling>; set: (enabled: boolean) => Promise<ConnectBilling> };

const webRoot = "https://phaseo.app";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;

/** The state in a response; both the snake_case and camelCase spellings are read. */
export function parseConnectBilling(body: unknown): ConnectBilling {
	const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
	const state = value.connect && typeof value.connect === "object" ? value.connect as Record<string, unknown> : value;
	const enabled = state.enabled, paidUp = state.paidUp ?? state.paid_up;
	const daysOn = number(state.daysOn ?? state.days_on ?? state.daysOnThisMonth ?? state.days_on_this_month);
	const estimatedNanos = number(state.estimatedNanos ?? state.estimated_nanos ?? state.estimatedChargeNanos ?? state.estimated_charge_nanos);
	if (typeof enabled !== "boolean" || daysOn === undefined || estimatedNanos === undefined) throw new Error("Phaseo returned an invalid Phaseo Connect state.");
	const workspaceName = state.workspaceName ?? state.workspace_name;
	return { enabled, paidUp: paidUp !== false, daysOn, estimatedNanos, ...typeof workspaceName === "string" && workspaceName ? { workspaceName: workspaceName.slice(0, 200) } : {} };
}

export function connectBillingClient({ accessToken, workspaceId, fetcher = fetch, root = webRoot }: { accessToken: () => Promise<string>; workspaceId?: string; fetcher?: typeof fetch; root?: string }): ConnectBillingClient {
	const request = async (method: "GET" | "POST", body?: Record<string, unknown>) => {
		const url = new URL("/api/account/settings/connect", root);
		if (method === "GET" && workspaceId) url.searchParams.set("workspace_id", workspaceId);
		const response = await fetcher(url, {
			method, redirect: "error", signal: AbortSignal.timeout(15_000),
			headers: { Authorization: `Bearer ${await accessToken()}`, ...body ? { "content-type": "application/json" } : {} },
			...body ? { body: JSON.stringify({ ...workspaceId ? { workspace_id: workspaceId } : {}, ...body }) } : {},
		});
		if (response.status === 401) throw new Error("Your Phaseo login has ended. Sign in again in Settings → Accounts.");
		if (response.status === 402) throw new Error("Add Phaseo credits to turn on Phaseo Connect.");
		if (response.status === 404) throw new Error("Phaseo Connect isn't available yet.");
		if (!response.ok) throw new Error(`Phaseo couldn't update Phaseo Connect (HTTP ${response.status}). Try again.`);
		const text = await response.text();
		if (text.length > 65_536) throw new Error("Phaseo returned an invalid Phaseo Connect state.");
		let parsed: unknown;
		try { parsed = JSON.parse(text); } catch { throw new Error("Phaseo returned an invalid Phaseo Connect state."); }
		return parseConnectBilling(parsed);
	};
	return { read: () => request("GET"), set: enabled => request("POST", { enabled }) };
}
