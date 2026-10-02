import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationTraceView } from "./GenerationTraceView";
import type { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

jest.mock("./RoutingTracePanel", () => ({ RoutingTracePanel: () => null }));
jest.mock("./DetailDialogPrimitives", () => ({ DetailTimingBar: () => null }));

test("displays the gateway's final text and retained camelCase tool round timing", () => {
	const html = renderToStaticMarkup(<GenerationTraceView request={{ request_id: "test", success: true } as RequestRow} timelineItems={[]} ioLog={{
		status: "stored", storage_provider: "cloudflare_r2", bytes: 100, retention_until: null, error: null,
		payload: {
			gateway_response: { output_text: "Final gateway answer" },
			provider_response: { choices: [{ message: { content: "Intermediate provider answer", tool_calls: [{ id: "tool1", function: { name: "search", arguments: "{}" } }] } }] },
			server_tool_trace: [{ round: 1, durationMs: 123, calls: [{ id: "tool1", name: "search", arguments: "{}", output: "Search result" }] }],
		},
	}} />);
	const completion = html.slice(html.indexOf('id="trace-response"'), html.indexOf('id="trace-capture"'));
	expect(completion).toContain("Final gateway answer");
	expect(completion).not.toContain("Intermediate provider answer");
	expect(html).toContain("123 ms");
	expect(html).toContain("Search result");
});
