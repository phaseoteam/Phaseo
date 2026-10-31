import { AsyncLocalStorage } from "node:async_hooks";
import { aroundEach, vi } from "vitest";

// Server functions read their options from TanStack Start's request context,
// which only exists while the Start server handles a request. Run every test
// inside an empty context. The storage lives on a global symbol that Start
// reuses when it loads.
const START_CONTEXT_KEY = Symbol.for("tanstack-start:start-storage-context");
const globals = globalThis as unknown as Record<symbol, AsyncLocalStorage<unknown> | undefined>;
const startStorage = (globals[START_CONTEXT_KEY] ??= new AsyncLocalStorage());

aroundEach(async (runTest) => {
	await startStorage.run({ startOptions: {}, contextAfterGlobalMiddlewares: {}, executedRequestMiddlewares: new Set() }, runTest);
});

// The Start compiler normally splits each server function into a client stub
// that calls the server over RPC and the server handler. Tests run without
// the compiler, so the "RPC" here calls the server side in-process: client
// middleware, then server middleware and the validator, then the handler.
// Tests call server functions the way the app does, as `fn({ data })`.
type ServerFnResult = { result?: unknown; error?: unknown; context?: unknown };
type ServerFn = ((opts?: unknown) => Promise<unknown>) & { __executeServer?: (opts: Record<string, unknown>) => Promise<ServerFnResult> };
type Builder = ((...args: unknown[]) => unknown) & Record<string, unknown>;

function wrapBuilder(builder: Builder): Builder {
	return new Proxy(builder, {
		apply(target, thisArg, args) {
			return wrapBuilder(Reflect.apply(target, thisArg, args) as Builder);
		},
		get(target, key, receiver) {
			const value = Reflect.get(target, key, receiver);
			if (key === "handler") {
				return (handler: (ctx: unknown) => unknown) => {
					let serverFn: ServerFn;
					const callServer = async (payload: { data?: unknown; context?: unknown; method?: string; signal?: AbortSignal }) => {
						const response = await serverFn.__executeServer!({ data: payload.data, context: payload.context, method: payload.method, signal: payload.signal });
						return "error" in response ? { error: response.error } : { result: response.result };
					};
					serverFn = (value as (extracted: unknown, server: unknown) => ServerFn)(callServer, handler);
					return serverFn;
				};
			}
			if (typeof value === "function" && (key === "middleware" || key === "validator" || key === "inputValidator")) {
				return (...args: unknown[]) => wrapBuilder((value as (...a: unknown[]) => Builder)(...args));
			}
			return value;
		},
	});
}

vi.mock("@tanstack/react-start", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-start")>();
	return {
		...actual,
		createServerFn: (...args: unknown[]) => wrapBuilder((actual.createServerFn as unknown as (...a: unknown[]) => Builder)(...args)),
	};
});
