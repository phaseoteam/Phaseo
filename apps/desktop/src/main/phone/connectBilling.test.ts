import { describe, expect, it, vi } from "vitest";
import { connectBillingClient, parseConnectBilling } from "./connectBilling";

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Phaseo Connect billing client", () => {
	it("reads and switches the state with the login's access token", async () => {
		const fetcher = vi.fn<typeof fetch>(async () => response(200, { enabled: true, paid_up: true, days_on: 3, estimated_nanos: 96_774_193, workspace_name: "Acme" }));
		const client = connectBillingClient({ accessToken: async () => "access", workspaceId: "ws-1", fetcher, root: "https://phaseo.example" });
		expect(await client.read()).toEqual({ enabled: true, paidUp: true, daysOn: 3, estimatedNanos: 96_774_193, workspaceName: "Acme" });
		expect(String(fetcher.mock.calls[0]![0])).toBe("https://phaseo.example/api/account/settings/connect?workspace_id=ws-1");
		expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", headers: { Authorization: "Bearer access" } });
		await client.set(false);
		expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "POST", body: JSON.stringify({ workspace_id: "ws-1", enabled: false }) });
	});
	it("explains failures in words and refuses a malformed state", async () => {
		const client = (status: number, body: unknown = {}) => connectBillingClient({ accessToken: async () => "access", fetcher: (async () => response(status, body)) as typeof fetch });
		await expect(client(401).read()).rejects.toThrow("Sign in again");
		await expect(client(402).set(true)).rejects.toThrow("Add Phaseo credits");
		await expect(client(200, { enabled: "yes" }).read()).rejects.toThrow("invalid");
		expect(parseConnectBilling({ connect: { enabled: false, paidUp: false, daysOn: 0, estimatedNanos: 0 } })).toEqual({ enabled: false, paidUp: false, daysOn: 0, estimatedNanos: 0 });
	});
});
