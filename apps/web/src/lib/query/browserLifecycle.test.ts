import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { listenForQuerySession } from "./browserLifecycle";
import { createWebQueryClient } from "./queryClient";
import { webQueryKeys } from "./queryKeys";

describe("query session synchronization", () => {
	let client: ReturnType<typeof createWebQueryClient>;
	let emit: (event: AuthChangeEvent, session: Session | null) => void;
	let unsubscribe: jest.Mock;
	let reload: jest.Mock;
	let stop: () => void;
	const privateKey = (userId: string) => webQueryKeys.account.workspaceSearch({ userId, workspaceId: "workspace-a" });
	const session = (userId: string) => ({ user: { id: userId } }) as Session;

	beforeEach(() => {
		jest.useFakeTimers();
		client = createWebQueryClient();
		unsubscribe = jest.fn();
		reload = jest.fn();
		stop = listenForQuerySession(client, {
			onAuthStateChange: (callback) => {
				emit = callback;
				return { data: { subscription: { id: "fixture", callback, unsubscribe } } };
			},
		}, reload);
	});
	afterEach(() => { stop(); client.clear(); jest.useRealTimers(); });

	it("does not reload on initial session, repeated sign-in, or token refresh for the same user", () => {
		client.setQueryData(privateKey("a"), ["private-a"]);
		emit("INITIAL_SESSION", session("a"));
		emit("SIGNED_IN", session("a"));
		emit("TOKEN_REFRESHED", session("a"));
		expect(reload).not.toHaveBeenCalled();
		expect(client.getQueryData(privateKey("a"))).toEqual(["private-a"]);
	});

	it.each(["SIGNED_OUT", "SIGNED_IN", "TOKEN_REFRESHED"] as const)("discards old data on identity change via %s", async (event) => {
		emit("INITIAL_SESSION", session("a"));
		client.setQueryData(privateKey("a"), ["private-a"]);
		client.setQueryData(webQueryKeys.public.search(), ["public"]);
		let signal: AbortSignal | undefined;
		const pending = client.fetchQuery({ queryKey: [...privateKey("a"), "pending"], queryFn: (context) => {
			signal = context.signal;
			return new Promise(() => undefined);
		} }).catch(() => undefined);
		emit(event, event === "SIGNED_OUT" ? null : session("b"));
		expect(signal?.aborted).toBe(true);
		expect(client.getQueryData(privateKey("a"))).toBeUndefined();
		expect(client.getQueryData(webQueryKeys.public.search())).toEqual(["public"]);
		expect(reload).toHaveBeenCalledTimes(1);
		emit(event, null);
		expect(reload).toHaveBeenCalledTimes(1);
		await pending;
	});

	it("rejects stale SSR scope when the initial browser session belongs to another user", () => {
		client.setQueryData(privateKey("a"), ["private-a"]);
		emit("INITIAL_SESSION", session("b"));
		expect(client.getQueryData(privateKey("a"))).toBeUndefined();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("reloads on sign-out even if the page contains only server-rendered private content", () => {
		emit("SIGNED_OUT", null);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("unsubscribes on unmount", () => {
		stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("lets sign-in finish its own redirect without disabling later session resets", () => {
		emit("INITIAL_SESSION", null);
		reload.mockReturnValueOnce(false);
		client.setQueryData(privateKey("anonymous"), ["anonymous"]);
		emit("SIGNED_IN", session("a"));
		expect(reload).toHaveBeenLastCalledWith({ previousUserId: null, nextUserId: "a" });
		expect(client.getQueryData(privateKey("anonymous"))).toBeUndefined();
		client.setQueryData(privateKey("a"), ["private-a"]);
		emit("SIGNED_OUT", null);
		expect(reload).toHaveBeenCalledTimes(2);
		expect(client.getQueryData(privateKey("a"))).toBeUndefined();
	});
});
