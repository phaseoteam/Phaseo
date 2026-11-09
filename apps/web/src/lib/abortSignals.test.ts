import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { anySignal, timeoutSignal } from "./abortSignals";

type MutableAbortSignal = {
	any?: typeof AbortSignal.any;
	timeout?: typeof AbortSignal.timeout;
};

const signalStatics = AbortSignal as unknown as MutableAbortSignal;
const nativeAny = AbortSignal.any;
const nativeTimeout = AbortSignal.timeout;

function trackListeners(signal: AbortSignal) {
	let active = 0;
	const add = signal.addEventListener.bind(signal);
	const remove = signal.removeEventListener.bind(signal);
	signal.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
		if (type === "abort") active += 1;
		add(type, listener, options);
	}) as typeof signal.addEventListener;
	signal.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
		if (type === "abort") active -= 1;
		remove(type, listener, options);
	}) as typeof signal.removeEventListener;
	return () => active;
}

describe("abort signal helpers without native support (older iOS Safari)", () => {
	beforeEach(() => {
		// Simulate Safari < 16 / < 17.4, where these statics are undefined.
		signalStatics.any = undefined;
		signalStatics.timeout = undefined;
	});

	afterEach(() => {
		signalStatics.any = nativeAny;
		signalStatics.timeout = nativeTimeout;
		vi.useRealTimers();
	});

	it("timeoutSignal aborts with a TimeoutError after the delay", () => {
		vi.useFakeTimers();
		const signal = timeoutSignal(1_000);

		vi.advanceTimersByTime(999);
		expect(signal.aborted).toBe(false);

		vi.advanceTimersByTime(1);
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toBeInstanceOf(DOMException);
		expect((signal.reason as DOMException).name).toBe("TimeoutError");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("anySignal follows the first input to abort, with its reason", () => {
		const first = new AbortController();
		const second = new AbortController();
		const combined = anySignal([first.signal, second.signal]);
		expect(combined.aborted).toBe(false);

		const reason = new Error("caller cancelled");
		second.abort(reason);
		expect(combined.aborted).toBe(true);
		expect(combined.reason).toBe(reason);

		first.abort(new Error("later"));
		expect(combined.reason).toBe(reason);
	});

	it("anySignal is aborted immediately when an input already is", () => {
		const live = new AbortController();
		const done = new AbortController();
		const reason = new Error("already aborted");
		done.abort(reason);
		const countLive = trackListeners(live.signal);

		const combined = anySignal([live.signal, done.signal]);

		expect(combined.aborted).toBe(true);
		expect(combined.reason).toBe(reason);
		expect(countLive()).toBe(0);
	});

	it("anySignal removes its listeners from every input once one aborts", () => {
		const caller = new AbortController();
		const other = new AbortController();
		const countCaller = trackListeners(caller.signal);
		const countOther = trackListeners(other.signal);

		anySignal([caller.signal, other.signal]);
		expect(countCaller()).toBe(1);
		expect(countOther()).toBe(1);

		other.abort();
		expect(countCaller()).toBe(0);
		expect(countOther()).toBe(0);
	});

	it("combines a caller signal with a fallback timeout", () => {
		vi.useFakeTimers();
		const caller = new AbortController();
		const countCaller = trackListeners(caller.signal);
		const combined = anySignal([caller.signal, timeoutSignal(15_000)]);

		vi.advanceTimersByTime(15_000);
		expect(combined.aborted).toBe(true);
		expect((combined.reason as DOMException).name).toBe("TimeoutError");
		expect(countCaller()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("abort signal helpers with native support", () => {
	it("delegates to the native statics", () => {
		const anySpy = vi.spyOn(AbortSignal, "any");
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		try {
			const controller = new AbortController();
			anySignal([controller.signal]);
			timeoutSignal(5);
			expect(anySpy).toHaveBeenCalledWith([controller.signal]);
			expect(timeoutSpy).toHaveBeenCalledWith(5);
		} finally {
			anySpy.mockRestore();
			timeoutSpy.mockRestore();
		}
	});
});
