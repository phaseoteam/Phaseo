import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteWithUndo, dismissUndo, offerUndo, runUndo } from "./threadUndo";

afterEach(() => { dismissUndo(); vi.useRealTimers(); });

describe("thread undo", () => {
	it("deletes only once the notice goes without Undo", async () => {
		vi.useFakeTimers();
		const remove = vi.fn(async () => {});
		deleteWithUndo("a", remove);
		expect(remove).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(remove).toHaveBeenCalledTimes(1);
	});
	it("keeps the chat when undone, and groups deletions made together", async () => {
		vi.useFakeTimers();
		const remove = vi.fn(async () => {});
		deleteWithUndo("a", remove); deleteWithUndo("b", remove);
		expect(runUndo()).toBe(true);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(remove).not.toHaveBeenCalled();
		deleteWithUndo("c", remove); deleteWithUndo("d", remove);
		dismissUndo();
		await vi.runAllTimersAsync();
		expect(remove).toHaveBeenCalledTimes(2);
	});
	it("lets a different action end a pending deletion", async () => {
		const remove = vi.fn(async () => {});
		deleteWithUndo("a", remove);
		offerUndo("Archived", async () => {});
		await Promise.resolve();
		expect(remove).toHaveBeenCalledTimes(1);
	});
});
