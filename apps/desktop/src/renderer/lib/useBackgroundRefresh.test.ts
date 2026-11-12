import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKGROUND_REFRESH_MS, watchBackgroundRefresh } from "./useBackgroundRefresh";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("background refresh", () => {
	it("refreshes every ten minutes and stops on navigation", () => {
		vi.useFakeTimers(); vi.stubGlobal("document", { visibilityState: "visible" });
		const read = vi.fn(); const stop = watchBackgroundRefresh(read);
		vi.advanceTimersByTime(BACKGROUND_REFRESH_MS - 1); expect(read).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1); expect(read).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(BACKGROUND_REFRESH_MS); expect(read).toHaveBeenCalledTimes(2);
		stop(); vi.advanceTimersByTime(BACKGROUND_REFRESH_MS); expect(read).toHaveBeenCalledTimes(2);
	});
	it("skips hidden screens", () => {
		vi.useFakeTimers(); const page = { visibilityState: "hidden" }; vi.stubGlobal("document", page);
		const read = vi.fn(); const stop = watchBackgroundRefresh(read);
		vi.advanceTimersByTime(BACKGROUND_REFRESH_MS); expect(read).not.toHaveBeenCalled();
		page.visibilityState = "visible"; vi.advanceTimersByTime(BACKGROUND_REFRESH_MS); expect(read).toHaveBeenCalledTimes(1); stop();
	});
});
