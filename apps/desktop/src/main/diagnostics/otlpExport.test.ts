import { afterEach, expect, it, vi } from "vitest";
import { validateTraceExport, tracesUrl } from "../../shared/traceExport";
import { OtlpExporter, otlpBody } from "./otlpExport";
import type { SpanRecord } from "./tracer";

afterEach(() => { vi.unstubAllEnvs(); });
const span = (name: string, failed = false): SpanRecord => ({ type: "span", name, traceId: "a".repeat(32), spanId: "b".repeat(16), startTimeUnixNano: "1", endTimeUnixNano: "2", durationMs: 1, attributes: { model: "x", steps: 3, ok: true }, exit: failed ? { _tag: "Failure", cause: "Boom" } : { _tag: "Success" }, events: [] });

it("checks collector settings, and keeps credentials as references", () => {
	expect(validateTraceExport(undefined)).toEqual({ endpoint: null, headers: {} });
	expect(validateTraceExport({ endpoint: "http://localhost:4318", headers: { Authorization: "env:OTEL_TOKEN", "x-team": "desktop" } })).toEqual({ endpoint: "http://localhost:4318", headers: { Authorization: "env:OTEL_TOKEN", "x-team": "desktop" } });
	expect(() => validateTraceExport({ endpoint: "http://otel.example.com" })).toThrow("https://");
	expect(() => validateTraceExport({ endpoint: "https://otel.example.com", headers: { Authorization: "Bearer abc" } })).toThrow("reference");
	expect([tracesUrl("https://otel.example.com/"), tracesUrl("https://otel.example.com/v1/traces")]).toEqual(["https://otel.example.com/v1/traces", "https://otel.example.com/v1/traces"]);
});

it("sends finished spans in OTLP JSON with their outcome, and only when a collector is set", async () => {
	vi.stubEnv("OTEL_TEST_TOKEN", "t0k");
	const fetcher = vi.fn(async () => new Response("{}"));
	const exporter = new OtlpExporter("1.2.3", fetcher as unknown as typeof fetch, 60_000);
	exporter.add(span("chat.title"));
	await exporter.flush();
	expect(fetcher).not.toHaveBeenCalled();
	exporter.configure({ endpoint: "https://otel.example.com", headers: { Authorization: "env:OTEL_TEST_TOKEN" } });
	exporter.add(span("turn.run")); exporter.add(span("turn.run", true)); exporter.add({ type: "log", level: "error", message: "x", timeUnixNano: "1" });
	await exporter.flush();
	const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
	expect(url).toBe("https://otel.example.com/v1/traces");
	expect((init.headers as Record<string, string>).Authorization).toBe("t0k");
	const spans = JSON.parse(String(init.body)).resourceSpans[0].scopeSpans[0].spans;
	expect(spans.map((value: { status: { code: number } }) => value.status.code)).toEqual([1, 2]);
	expect(otlpBody([span("x")], "1").resourceSpans[0].scopeSpans[0].spans[0].attributes).toEqual([{ key: "model", value: { stringValue: "x" } }, { key: "steps", value: { intValue: "3" } }, { key: "ok", value: { boolValue: true } }]);
});
