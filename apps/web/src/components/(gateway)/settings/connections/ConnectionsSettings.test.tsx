import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsUi from "../../../../../messages/en-GB/settings-ui.json";
import { CallbackNotice, ConnectionsBody } from "./ConnectionsSettings";
import { CONNECTORS } from "./connectorsCatalog";

let search = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => search }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/app/(dashboard)/settings/connections/actions", () => ({ startConnectionAction: jest.fn(), disconnectConnectionAction: jest.fn() }));
jest.mock("@/components/(gateway)/settings/PrivateSettingsQuery", () => ({ useSettingsRouter: () => ({ refresh: jest.fn() }) }));

function render(node: React.ReactNode) {
	return renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" messages={{ SettingsUI: settingsUi }}>{node}</NextIntlClientProvider>);
}

const data = {
	enabled: true,
	mcpUrl: "https://mcp.phaseo.app/mcp",
	connections: [
		{ id: "c1", label_slug: "linear", display_name: "Linear", server_url: "https://mcp.linear.app/mcp", status: "active" as const, last_used_at: null, created_at: "2026-10-22T00:00:00Z" },
		{ id: "c2", label_slug: "notion", display_name: "Notion", server_url: "https://mcp.notion.com/mcp", status: "needs_reauth" as const, last_used_at: null, created_at: "2026-10-22T00:00:00Z" },
	],
};

describe("Connections settings", () => {
	it("shows the hub address, the setup command, connections and the catalogue", () => {
		const html = render(<ConnectionsBody data={data} />);
		expect(html).toContain("https://mcp.phaseo.app/mcp");
		expect(html).toContain("claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp");
		expect(html).toContain("Linear");
		expect(html).toContain("Sign in again");
		expect(html).toContain("A site admin must allow Phaseo first.");
		for (const connector of CONNECTORS) expect(html).toContain(connector.name);
		// Already-connected catalogue entries offer Reconnect instead of Connect.
		expect(html.match(/>Reconnect</g)?.length).toBe(3);
	});

	it("says when nothing is connected", () => {
		expect(render(<ConnectionsBody data={{ ...data, connections: [] }} />)).toContain("Nothing connected yet.");
	});

	it("explains callback results and never echoes unknown error codes", () => {
		search = new URLSearchParams({ connected: "linear" });
		expect(render(<CallbackNotice />)).toContain("Connected. Its tools now appear");
		search = new URLSearchParams({ error: "session_mismatch" });
		expect(render(<CallbackNotice />)).toContain("Sign in to Phaseo as the person who started the connection.");
		search = new URLSearchParams({ error: "<script>x</script>" });
		const html = render(<CallbackNotice />);
		expect(html).toContain("Could not connect that server.");
		expect(html).not.toContain("script");
	});
});
