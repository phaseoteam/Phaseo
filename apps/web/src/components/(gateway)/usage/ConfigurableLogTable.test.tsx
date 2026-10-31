import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConfigurableLogTable from "./ConfigurableLogTable";
import type { ReactNode } from "react";
import { AppIntlProvider } from "@/i18n/react";
import { getPublicMessages } from "@/i18n/messages";

const messages = await getPublicMessages("en-GB");
const withIntl = (node: ReactNode) => <AppIntlProvider locale="en-GB" timeZone="UTC" messages={messages}>{node}</AppIntlProvider>;

vi.mock("./TableSettings", () => ({ default: () => null }));

describe("log table detail access", () => {
	it("keeps table semantics and exposes a named native button for each detail action", () => {
		const markup = renderToStaticMarkup(withIntl(<ConfigurableLogTable
			tableId="test" label="sessions" definitions={[{ id: "cost", label: "Cost" }]}
			rows={[{ id: "session-1" }, { id: "session-2" }]} rowKey={(row) => row.id}
			renderCell={() => "$0.00"} onRowClick={() => {}} emptyMessage="Empty"
		/>));
		expect(markup).toContain('aria-label="Open details for sessions: session-1"');
		expect(markup).toContain('aria-label="Open details for sessions: session-2"');
		expect(markup).toContain('type="button"');
		expect(markup).not.toMatch(/<tr[^>]*(?:tabindex|role="button")/);
	});

	it("does not advertise details when the table has no detail action", () => {
		const markup = renderToStaticMarkup(withIntl(<ConfigurableLogTable
			tableId="test" label="sessions" definitions={[{ id: "cost", label: "Cost" }]}
			rows={[{ id: "session-1" }]} rowKey={(row) => row.id}
			renderCell={() => "$0.00"} emptyMessage="Empty"
		/>));
		expect(markup).not.toContain("Open details");
	});
});
