/**
 * Phaseo Connect's billing state, from the website's account routes the desktop already signs in to (Bearer: the
 * Phaseo login's access token). The relay checks entitlement itself; this is what Settings → Phone shows and switches.
 * The server counts the days and amounts in SQL (apps/web-api/src/routes/account/settings-connect.ts).
 *
 *   GET {root}/api/account/settings/connect?workspaceId=…              → { connect }
 *   PUT {root}/api/account/settings/connect?workspaceId=…  { enabled }  → { changed, connect }
 */
export type ConnectBilling = {
	enabled: boolean;
	/** A finished month is unpaid: Connect is off until it's taken from credits. */
	paymentDue: boolean;
	/** Owners and admins switch it, because it bills the workspace; anyone can see it. */
	canManage: boolean;
	daysOn: number;
	chargeSoFarNanos: number;
	/** What this month comes to if Connect stays as it is until the month ends. */
	estimatedNanos: number;
	unpaidMonths: number;
	unpaidNanos: number;
	workspaceName?: string;
};
export type ConnectBillingClient = { read: () => Promise<ConnectBilling>; set: (enabled: boolean) => Promise<ConnectBilling> };

const webRoot = "https://phaseo.app";
const invalid = "Phaseo returned an invalid Phaseo Connect state.";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** The `connect` object of a response. */
export function parseConnectBilling(body: unknown): ConnectBilling {
	const state = record(record(body).connect), month = record(state.month), unpaid = record(state.unpaid);
	const values = { daysOn: count(month.daysOn), chargeSoFarNanos: count(month.chargeSoFarNanos), estimatedNanos: count(month.estimatedNanos), unpaidMonths: count(unpaid.months), unpaidNanos: count(unpaid.amountNanos) };
	if (typeof state.enabled !== "boolean" || typeof state.paymentDue !== "boolean" || Object.values(values).some(value => value === undefined)) throw new Error(invalid);
	const workspaceName = typeof state.workspaceName === "string" && state.workspaceName ? state.workspaceName.slice(0, 200) : undefined;
	return { enabled: state.enabled, paymentDue: state.paymentDue, canManage: state.canManage === true, ...values as { [K in keyof typeof values]: number }, ...workspaceName ? { workspaceName } : {} };
}

export function connectBillingClient({ accessToken, workspaceId, fetcher = fetch, root = webRoot }: { accessToken: () => Promise<string>; workspaceId?: string; fetcher?: typeof fetch; root?: string }): ConnectBillingClient {
	const request = async (method: "GET" | "PUT", body?: { enabled: boolean }) => {
		if (!workspaceId) throw new Error("Sign in to Phaseo again in Settings → Accounts, so Phaseo Connect knows which workspace to bill.");
		const url = new URL("/api/account/settings/connect", root);
		url.searchParams.set("workspaceId", workspaceId);
		const response = await fetcher(url, {
			method, redirect: "error", signal: AbortSignal.timeout(15_000),
			headers: { Authorization: `Bearer ${await accessToken()}`, ...body ? { "content-type": "application/json" } : {} },
			...body ? { body: JSON.stringify(body) } : {},
		});
		const text = await response.text();
		let parsed: unknown;
		try { parsed = text.length <= 65_536 ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
		if (response.status === 401) throw new Error("Your Phaseo login has ended. Sign in again in Settings → Accounts.");
		if (response.status === 404) throw new Error("Phaseo Connect isn't available yet.");
		if (!response.ok) {
			// The server explains a refusal in words (not a member, not an owner or admin, unavailable).
			const message = record(parsed).message;
			throw new Error(typeof message === "string" && message.length <= 300 ? message : `Phaseo couldn't update Phaseo Connect (HTTP ${response.status}). Try again.`);
		}
		return parseConnectBilling(parsed);
	};
	return { read: () => request("GET"), set: enabled => request("PUT", { enabled }) };
}
