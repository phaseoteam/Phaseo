import { describe, expect, it, vi } from "vitest";
import { connectBillingClient, parseConnectBilling } from "./connectBilling";

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
// The web-api's connect state, as settings-connect.ts returns it.
const serverState = (change: Record<string, unknown> = {}) => ({
	workspaceId: "11111111-2222-4333-8444-555555555555", workspaceName: "Acme", canManage: true, enabled: true, paymentDue: false, active: true,
	enabledAt: "2026-11-01T00:00:00Z", disabledAt: null, priceNanos: 1_000_000_000, price: "$1.00",
	month: { periodStart: "2026-11-01", daysOn: 3, daysInMonth: 30, chargeSoFarNanos: 100_000_000, chargeSoFar: "$0.10", estimatedNanos: 1_000_000_000, estimated: "$1.00" },
	unpaid: { months: 0, amountNanos: 0, amount: "$0.00" },
	...change,
});

describe("Phaseo Connect billing client", () => {
	it("reads and switches the state for the signed-in workspace with the login's access token", async () => {
		const fetcher = vi.fn<typeof fetch>(async () => response(200, { connect: serverState() }));
		const client = connectBillingClient({ accessToken: async () => "access", workspaceId: "ws-1", fetcher, root: "https://phaseo.example" });
		expect(await client.read()).toEqual({ enabled: true, paymentDue: false, canManage: true, daysOn: 3, chargeSoFarNanos: 100_000_000, estimatedNanos: 1_000_000_000, unpaidMonths: 0, unpaidNanos: 0, workspaceName: "Acme" });
		expect(String(fetcher.mock.calls[0]![0])).toBe("https://phaseo.example/api/account/settings/connect?workspaceId=ws-1");
		expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", headers: { Authorization: "Bearer access" } });
		await client.set(false);
		expect(String(fetcher.mock.calls[1]![0])).toBe("https://phaseo.example/api/account/settings/connect?workspaceId=ws-1");
		expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "PUT", body: JSON.stringify({ enabled: false }) });
	});
	it("reads an unpaid month", () => {
		expect(parseConnectBilling({ changed: true, connect: serverState({ paymentDue: true, active: false, unpaid: { months: 1, amountNanos: 1_000_000_000, amount: "$1.00" } }) }))
			.toMatchObject({ enabled: true, paymentDue: true, unpaidMonths: 1, unpaidNanos: 1_000_000_000 });
	});
	it("explains failures in words and refuses a malformed state", async () => {
		const client = (status: number, body: unknown = {}, workspaceId: string | null = "ws-1") => connectBillingClient({ accessToken: async () => "access", workspaceId: workspaceId ?? undefined, fetcher: (async () => response(status, body)) as typeof fetch });
		await expect(client(401).read()).rejects.toThrow("Sign in again");
		await expect(client(403, { error: "forbidden", message: "Only workspace owners and admins can turn Phaseo Connect on or off." }).set(true)).rejects.toThrow("Only workspace owners and admins");
		await expect(client(503, "down").read()).rejects.toThrow("HTTP 503");
		await expect(client(200, {}, null).read()).rejects.toThrow("which workspace to bill");
		await expect(client(200, { connect: { enabled: "yes" } }).read()).rejects.toThrow("invalid");
		await expect(client(200, { enabled: true, paidUp: true, daysOn: 1, estimatedNanos: 0 }).read()).rejects.toThrow("invalid");
	});
});
