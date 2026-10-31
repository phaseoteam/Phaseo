import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchInternalAuthHeaderData } from "./fetchInternalAuthHeaderData";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { createClient } from "@/utils/supabase/server";
import { currentRequestCookie } from "@/lib/server/currentRequest";

vi.mock("@/lib/server/currentRequest", () => ({ currentRequestCookie: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: vi.fn() }));

describe("server authentication header loading", () => {
	const getSession = vi.fn();
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.mocked(currentRequestCookie).mockImplementation((name) => (name === "activeWorkspaceId" ? "workspace/name" : undefined));
		vi.mocked(createClient).mockResolvedValue({ auth: { getSession } } as never);
		getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
	});
	afterEach(() => vi.useRealTimers());

	it("returns signed-out data without an account API call when no session exists", async () => {
		getSession.mockResolvedValue({ data: { session: null } });
		await expect(fetchInternalAuthHeaderData()).resolves.toEqual({ isLoggedIn: false, teams: [] });
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves auth, workspace and search parameters with a cancellation signal", async () => {
		const result = { isLoggedIn: true, teams: [] };
		vi.mocked(fetchAccountWebApi).mockResolvedValue(result);
		await expect(fetchInternalAuthHeaderData({ query: "example", limit: 10, offset: 2 })).resolves.toEqual(result);
		expect(fetchAccountWebApi).toHaveBeenCalledWith(
			"/api/account/auth/header?q=example&limit=10&offset=2", "test-token",
			{ signal: expect.any(AbortSignal), headers: { Cookie: "activeWorkspaceId=workspace%2Fname" } },
		);
		expect(createClient).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("makes one attempt on an API failure", async () => {
		const error = new Error("Unavailable");
		vi.mocked(fetchAccountWebApi).mockRejectedValue(error);
		await expect(fetchInternalAuthHeaderData()).rejects.toBe(error);
		expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("bounds an unresolved session before making any account request", async () => {
		getSession.mockImplementation(() => new Promise(() => {}));
		const result = fetchInternalAuthHeaderData();
		const rejection = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(15_000);
		await rejection;
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
		const options = vi.mocked(createClient).mock.calls[0][0];
		expect(options?.signal?.aborted).toBe(true);
	});

	it("aborts the account request within the same budget", async () => {
		vi.mocked(fetchAccountWebApi).mockImplementation(async (_path, _token, init) => {
			return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
		});
		const result = fetchInternalAuthHeaderData();
		const rejection = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(15_000);
		await rejection;
		expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
	});
});
