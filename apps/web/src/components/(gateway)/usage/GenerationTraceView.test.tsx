import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationTraceView } from "./GenerationTraceView";
import { OrderedLifecycleEvents, readLifecycleJournal } from "./OrderedLifecycleEvents";
import type { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

import messages0 from "../../../../messages/en-GB/settings-ui.json";
import messages1 from "../../../../messages/es-ES/settings-ui.json";
import messages2 from "../../../../messages/fr-FR/settings-ui.json";
import messages3 from "../../../../messages/de-DE/settings-ui.json";
import messages4 from "../../../../messages/pt-BR/settings-ui.json";
import messages5 from "../../../../messages/ja/settings-ui.json";
import messages6 from "../../../../messages/zh-Hans/settings-ui.json";
import messages7 from "../../../../messages/hi/settings-ui.json";
import messages8 from "../../../../messages/ar-SA/settings-ui.json";
const catalogs = { "en-GB": messages0, "es-ES": messages1, "fr-FR": messages2, "de-DE": messages3, "pt-BR": messages4, "ja": messages5, "zh-Hans": messages6, "hi": messages7, "ar-SA": messages8 } as const;

jest.mock("./RoutingTracePanel", () => ({ RoutingTracePanel: () => null }));
jest.mock("./DetailDialogPrimitives", () => ({ DetailTimingBar: () => null }));

test.each(Object.keys(catalogs) as Array<keyof typeof catalogs>)("renders retained tools and final gateway text without missing messages in %s", (locale) => {
	const messages = catalogs[locale];
	const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" onError={(error) => { throw error; }} messages={{ SettingsUI: messages }}><GenerationTraceView request={{ request_id: "test", success: true } as RequestRow} timelineItems={[]} ioLog={{
		status: "stored", storage_provider: "cloudflare_r2", bytes: 100, retention_until: null, error: null,
		payload: {
			gateway_response: { output_text: "Final gateway answer" },
			provider_response: { choices: [{ message: { content: "Intermediate provider answer", tool_calls: [{ id: "tool1", function: { name: "search", arguments: "{}" } }] } }] },
			server_tool_trace: [{ round: 1, durationMs: 123, calls: [{ id: "tool1", name: "search", arguments: "{}", output: "Search result" }] }],
		},
	}} /></NextIntlClientProvider>);
	const completion = html.slice(html.indexOf('id="trace-response"'), html.indexOf('id="trace-capture"'));
	expect(completion).toContain("Final gateway answer");
	expect(completion).not.toContain("Intermediate provider answer");
	expect(html).toContain("123 ms");
	expect(html).toContain("Search result");
	const journal = readLifecycleJournal({ version: 1, events: [
		{ sequence: 1, type: "provider.started", span_id: "model", call_kind: "initial", elapsed_ms: 0, timestamp_ms: 1000 },
		{ sequence: 2, type: "provider.response", span_id: "model", elapsed_ms: 1, timestamp_ms: 1001 },
		{ sequence: 3, type: "provider.completed", span_id: "model", elapsed_ms: 2, timestamp_ms: 1002 },
		{ sequence: 4, type: "tool.started", span_id: "tool", elapsed_ms: 3, timestamp_ms: 1003 },
		{ sequence: 5, type: "tool.completed", span_id: "tool", elapsed_ms: 4, timestamp_ms: 1004 },
		{ sequence: 6, type: "provider.started", span_id: "followup", call_kind: "continuation", elapsed_ms: 5, timestamp_ms: 1005 },
		{ sequence: 7, type: "provider.started", span_id: "retry", call_kind: "retry", elapsed_ms: 6, timestamp_ms: 1006 },
		{ sequence: 8, type: "provider.started", span_id: "child", call_kind: "nested", elapsed_ms: 7, timestamp_ms: 1007 },
	] });
	expect(() => renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" onError={(error) => { throw error; }} messages={{ SettingsUI: messages }}><OrderedLifecycleEvents journal={journal!} toolResults={new Map()} /></NextIntlClientProvider>)).not.toThrow();
});
