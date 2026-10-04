import { describe, expect, it, vi } from "vitest";
import type { PipelineContext, ProviderAttemptLog } from "./before/types";
import { finishStreamingProvider, lifecycleMetadata, recordLifecycleEvent, recordProviderResult, retainedLifecycle } from "./lifecycle";

const context = () => ({} as PipelineContext);

describe("ordered request lifecycle", () => {
	it("retains ordered operational metadata without tool payloads", () => {
		const metadata = lifecycleMetadata({ version: 1, events: [{ sequence: 1, timestamp_ms: 1000, elapsed_ms: 5, type: "tool.started", tool_name: "datetime", span_id: "tool1", arguments: "private prompt", output: "private result", tool_call_id: "private-id" }] });
		expect(metadata?.events[0]).toMatchObject({ sequence: 1, type: "tool.started", tool_name: "datetime", span_id: "tool1" });
		expect(JSON.stringify(metadata)).not.toContain("private");
	});
	it("does not classify local admission failures as executed model calls", () => {
		const ctx = context();
		const span = recordLifecycleEvent(ctx, { type: "provider.admission" });
		recordProviderResult(ctx, { lifecycle_span_id: span, provider: "test", outcome: "blocked" } as ProviderAttemptLog);
		expect(ctx.lifecycle?.events.map((event) => event.type)).toEqual(["provider.admission", "provider.rejected"]);
	});
	it("orders model, tool, and continuation even when every timestamp is identical", () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
		try {
			const ctx = context();
			const model = recordLifecycleEvent(ctx, { type: "provider.started", provider: "test", call_kind: "initial" });
			recordProviderResult(ctx, { lifecycle_span_id: model, provider: "test", outcome: "success", response_kind: "completed" } as ProviderAttemptLog);
			const tool = recordLifecycleEvent(ctx, { type: "tool.started", tool_call_id: "call1" });
			recordLifecycleEvent(ctx, { type: "tool.completed", span_id: tool });
			recordLifecycleEvent(ctx, { type: "provider.started", call_kind: "continuation" });
			expect(ctx.lifecycle?.events.map((event) => event.type)).toEqual(["provider.started", "provider.completed", "tool.started", "tool.completed", "provider.started"]);
			expect(ctx.lifecycle?.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
		} finally { clock.mockRestore(); }
	});

	it("records headers separately from stream completion and closes a stream only once", () => {
		const ctx = context();
		ctx.lifecycleProviderSpanId = recordLifecycleEvent(ctx, { type: "provider.started" });
		recordProviderResult(ctx, { lifecycle_span_id: ctx.lifecycleProviderSpanId, provider: "test", response_kind: "stream", outcome: "success", status: 200 } as ProviderAttemptLog);
		expect(ctx.lifecycle?.events.map((event) => event.type)).toEqual(["provider.started", "provider.response"]);
		finishStreamingProvider(ctx, "error");
		finishStreamingProvider(ctx);
		expect(ctx.lifecycle?.events.at(-1)).toMatchObject({ type: "provider.completed", sequence: 3, outcome: "error" });
		expect(ctx.lifecycle?.events).toHaveLength(3);
	});

	it("shares sequence and parent tool identity across concurrent nested model calls", async () => {
		const ctx = context();
		const tool = recordLifecycleEvent(ctx, { type: "tool.started" });
		await Promise.all(["model-a", "model-b"].map(async (model) => {
			const child = { ...ctx, lifecycleParentSpanId: tool };
			const span = recordLifecycleEvent(child, { type: "provider.started", model });
			await Promise.resolve();
			recordLifecycleEvent(child, { type: "provider.completed", span_id: span });
		}));
		expect(ctx.lifecycle?.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
		expect(ctx.lifecycle?.events.slice(1).every((event) => event.parent_span_id === tool)).toBe(true);
		expect(new Set(ctx.lifecycle?.events.filter((event) => event.type === "provider.started").map((event) => event.span_id)).size).toBe(2);
	});

	it("bounds retained metadata and explicitly marks incomplete traces", () => {
		const ctx = context();
		for (let i = 0; i < 1100; i++) recordLifecycleEvent(ctx, { type: "tool.started" });
		expect(retainedLifecycle(ctx)).toMatchObject({ version: 1, truncated: true });
		expect(retainedLifecycle(ctx)?.events).toHaveLength(1024);
		expect(retainedLifecycle(ctx)).not.toHaveProperty("origin");
	});
});
