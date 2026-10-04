import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { OrderedLifecycleEvents, readLifecycleJournal } from "./OrderedLifecycleEvents";
import messages from "../../../../messages/en-GB/settings-ui.json";
import { GenerationTraceView } from "./GenerationTraceView";
import type { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

jest.mock("./RoutingTracePanel", () => ({ RoutingTracePanel: () => null }));
jest.mock("./DetailDialogPrimitives", () => ({ DetailTimingBar: () => null }));

test("uses sequence instead of timestamps and interleaves tool execution between model calls", () => {
	const event = (sequence: number, type: string, fields = {}) => ({ sequence, type, elapsed_ms: sequence, timestamp_ms: 1000 - sequence, ...fields });
	const journal = readLifecycleJournal({ version: 1, events: [
		event(5, "provider.started", { span_id: "model2", call_kind: "continuation" }),
		event(3, "tool.started", { span_id: "tool", tool_call_id: "same-id", tool_name: "datetime" }),
		event(1, "provider.started", { span_id: "model1" }),
		event(2, "provider.completed", { span_id: "model1" }),
		event(4, "tool.completed", { span_id: "tool", tool_call_id: "same-id" }),
	] });
	expect(journal?.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
	const html = renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" onError={(error) => { throw error; }} messages={{ SettingsUI: messages }}><OrderedLifecycleEvents journal={journal!} toolResults={new Map([["tool", { output: "Time result", arguments: "{}" }]])} /></NextIntlClientProvider>);
	expect(html.indexOf("Model call started")).toBeLessThan(html.indexOf("Tool started"));
	expect(html.indexOf("Tool result")).toBeLessThan(html.indexOf("Model continuation started"));
	expect(html).toContain("Time result");
	const view = renderToStaticMarkup(<NextIntlClientProvider locale="en-GB" timeZone="UTC" onError={(error) => { throw error; }} messages={{ SettingsUI: messages }}><GenerationTraceView request={{ request_id: "fixture", success: true } as RequestRow} timelineItems={[]} ioLog={{
		status: "stored", storage_provider: "cloudflare_r2", bytes: 100, retention_until: null, error: null,
		payload: { lifecycle_events: { version: 1, ...journal }, gateway_response: { output_text: "Final answer" }, server_tool_trace: [{ round: 1, calls: [{ id: "same-id", spanId: "tool", name: "datetime", output: "Time result" }] }] },
	}} /></NextIntlClientProvider>);
	expect(view).toContain("Model calls");
	expect(view).not.toContain('id="trace-tools"');
	expect(view.indexOf('data-event-sequence="2"')).toBeLessThan(view.indexOf('data-event-sequence="3"'));
	expect(view.indexOf('data-event-sequence="4"')).toBeLessThan(view.indexOf('data-event-sequence="5"'));
	expect(view).toContain("Final answer");
});

test("rejects malformed event metadata and marks partial journals", () => {
	expect(readLifecycleJournal({ version: 2, events: [] })).toBeNull();
	const good = { sequence: 1, type: "tool.started", elapsed_ms: 0, timestamp_ms: 1000 };
	expect(readLifecycleJournal({ version: 1, events: [good, { ...good, timestamp_ms: 1e30 }] })).toMatchObject({ truncated: true, events: [good] });
	expect(readLifecycleJournal({ version: 1, events: [{ ...good, tool_name: {} }] })).toBeNull();
});
