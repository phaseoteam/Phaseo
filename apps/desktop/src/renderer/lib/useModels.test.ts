import { afterEach, describe, expect, it, vi } from "vitest";
import useSWR from "swr";
import { useModels } from "./useModels";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";

vi.mock("swr", () => ({ default: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("model cache policy", () => {
	it("preserves stale models, scopes accounts and retries automatically after ten minutes", () => {
		vi.useFakeTimers(); vi.stubGlobal("window", { phaseoDesktop: { workspace: { models: vi.fn() } } });
		const data = [{ id: "openai/model", name: "Model" }];
		vi.mocked(useSWR).mockReturnValue({ data, error: Error("Offline") } as ReturnType<typeof useSWR>);
		expect(useModels("phaseo", "first").models).toEqual(data);
		expect(useModels("phaseo", "second").models).toEqual(data);
		expect(vi.mocked(useSWR).mock.calls[0][0]).toEqual(["workspace-models", "phaseo", "first", ""]);
		expect(vi.mocked(useSWR).mock.calls[1][0]).toEqual(["workspace-models", "phaseo", "second", ""]);
		const config = vi.mocked(useSWR).mock.calls[0][2]!;
		expect(config.refreshInterval).toBe(BACKGROUND_REFRESH_MS); expect(config.revalidateOnFocus).toBe(false);
		const revalidate = vi.fn(); config.onErrorRetry!(Error("Offline"), "key", config as Parameters<NonNullable<typeof config.onErrorRetry>>[2], revalidate, { retryCount: 1, dedupe: true });
		vi.advanceTimersByTime(BACKGROUND_REFRESH_MS - 1); expect(revalidate).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1); expect(revalidate).toHaveBeenCalledTimes(1);
	});
});
