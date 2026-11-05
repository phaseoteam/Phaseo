import { afterEach, expect, it, vi } from "vitest";
import { slowRequestLabel, withSlowRequestNotice, type SlowRequestEvent } from "./slowRequests";

afterEach(() => { vi.useRealTimers(); });

it("reports a request still running past the threshold, then when it settles", async () => {
	vi.useFakeTimers();
	let finish!: (value: string) => void;
	const events: SlowRequestEvent[] = [];
	const api = withSlowRequestNotice({ workspace: { usageReport: () => new Promise<string>(resolve => { finish = resolve; }), quick: async () => "fast", onChange: () => () => undefined } }, event => events.push(event), 1000);
	const slow = api.workspace.usageReport();
	await expect(api.workspace.quick()).resolves.toBe("fast");
	expect(typeof api.workspace.onChange()).toBe("function");
	vi.advanceTimersByTime(999); expect(events).toEqual([]);
	vi.advanceTimersByTime(1); expect(events).toMatchObject([{ name: "workspace.usageReport", state: "slow" }]);
	finish("report"); await expect(slow).resolves.toBe("report");
	expect(events.map(event => event.state)).toEqual(["slow", "done"]);
	expect(events[0].id).toBe(events[1].id);
});

it("never reports requests that wait on the person, and passes failures through", async () => {
	vi.useFakeTimers();
	const events: SlowRequestEvent[] = [];
	const api = withSlowRequestNotice({ chooseProject: () => new Promise(() => undefined), fails: () => Promise.reject(new Error("No")) }, event => events.push(event), 10);
	void api.chooseProject();
	await expect(api.fails()).rejects.toThrow("No");
	vi.advanceTimersByTime(100);
	expect(events).toEqual([]);
	expect(slowRequestLabel("workspace.usageReport")).toBe("usage report");
});
