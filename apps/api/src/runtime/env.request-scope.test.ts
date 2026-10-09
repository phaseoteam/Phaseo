import { describe, expect, it, vi } from "vitest";
import { dispatchBackground, runWithRequestScope, setWaitUntil } from "./env";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("runWithRequestScope", () => {
	it("binds background work to the request that started it, even when requests interleave", async () => {
		const waitUntilA = vi.fn();
		const waitUntilB = vi.fn();
		let releaseA!: () => void;
		const gateA = new Promise<void>((resolve) => { releaseA = resolve; });

		const requestA = runWithRequestScope(waitUntilA, async () => {
			await gateA;
			dispatchBackground(Promise.resolve("a"));
		});
		const requestB = runWithRequestScope(waitUntilB, async () => {
			await tick();
			dispatchBackground(Promise.resolve("b"));
		});

		await requestB;
		releaseA();
		await requestA;

		expect(waitUntilA).toHaveBeenCalledTimes(1);
		expect(waitUntilB).toHaveBeenCalledTimes(1);
	});

	it("keeps the scope for work dispatched from a stream pump after the handler returns", async () => {
		const waitUntil = vi.fn();
		let pull!: () => void;
		const pumped = new Promise<void>((resolve) => { pull = resolve; });

		const response = await runWithRequestScope(waitUntil, async () => {
			void (async () => {
				await pumped;
				dispatchBackground(Promise.resolve("billing"));
			})();
			return "response";
		});

		expect(response).toBe("response");
		const other = vi.fn();
		await runWithRequestScope(other, async () => {
			pull();
			await tick();
		});
		await tick();

		expect(waitUntil).toHaveBeenCalledTimes(1);
		expect(other).not.toHaveBeenCalled();
	});

	it("falls back to the registered handler outside any request scope", () => {
		const handler = vi.fn();
		const release = setWaitUntil(handler);
		try {
			dispatchBackground(Promise.resolve("scheduled"));
			expect(handler).toHaveBeenCalledTimes(1);
		} finally {
			release();
		}
	});
});
