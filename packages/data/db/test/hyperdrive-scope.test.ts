import { describe, expect, it, vi } from "vitest";
import type { PostgresSql } from "../src/connections/hyperdrive";
import { createHyperdriveScope } from "../src/connections/hyperdrive-scope";

/** Just enough postgres.js for postgresJsExecutor: options.serializers, unsafe, begin, end. */
function fakeSql() {
	const calls: string[] = [];
	const sql = {
		options: { serializers: {} },
		unsafe: vi.fn(async (text: string) => {
			calls.push(text);
			return [{ ok: 1 }];
		}),
		begin: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(sql)),
		end: vi.fn(async () => {
			calls.push("END");
		}),
	};
	return { sql: sql as unknown as PostgresSql & { end: typeof sql.end }, calls };
}

function context() {
	const waited: Promise<unknown>[] = [];
	return { waited, ctx: { waitUntil: (p: Promise<unknown>) => void waited.push(p), passThroughOnException: vi.fn(), props: { a: 1 } } };
}

const binding = { connectionString: "postgres://hyperdrive.invalid/db" };

describe("createHyperdriveScope", () => {
	it("creates no client and ends nothing when the request never used the database", async () => {
		const createSql = vi.fn();
		const scope = createHyperdriveScope(binding, { createSql });
		const { ctx, waited } = context();
		scope.close(ctx);
		await Promise.all(waited);
		expect(createSql).not.toHaveBeenCalled();
		expect(scope.opened).toBe(false);
	});

	it("shares one connection across clients and ends it after the handler via waitUntil", async () => {
		const fake = fakeSql();
		const createSql = vi.fn(() => fake.sql);
		const scope = createHyperdriveScope(binding, { createSql, retry: false });
		const service = scope.serviceClient();
		expect(scope.serviceClient()).toBe(service);
		scope.client({ role: "authenticated", claims: { sub: "u" } });
		expect(createSql).toHaveBeenCalledTimes(1);
		const { ctx, waited } = context();
		scope.close(ctx);
		await Promise.all(waited);
		expect(fake.sql.end).toHaveBeenCalledWith({ timeout: 5 });
	});

	it("waits for background work and the streamed body before ending the connection", async () => {
		const fake = fakeSql();
		const scope = createHyperdriveScope(binding, { createSql: () => fake.sql, retry: false });
		const { ctx, waited } = context();
		const tracked = scope.trackingContext(ctx);
		expect(tracked.props).toEqual({ a: 1 });
		tracked.passThroughOnException();
		expect(ctx.passThroughOnException).toHaveBeenCalled();

		let finishBackground!: () => void;
		tracked.waitUntil(new Promise<void>((resolve) => (finishBackground = resolve)).then(async () => {
			await scope.serviceClient().from("t").select("*");
		}));

		const body = new TransformStream<Uint8Array, Uint8Array>();
		const response = scope.trackResponse(new Response(body.readable, { status: 200, headers: { "x-a": "1" } }));
		expect(response.headers.get("x-a")).toBe("1");
		scope.close(ctx);

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(fake.sql.end).not.toHaveBeenCalled();
		finishBackground();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(fake.sql.end).not.toHaveBeenCalled();

		const writer = body.writable.getWriter();
		const reading = response.text();
		await writer.write(new TextEncoder().encode("done"));
		await writer.close();
		expect(await reading).toBe("done");
		await Promise.all(waited);
		expect(fake.calls.at(-1)).toBe("END");
		expect(fake.calls.some((text) => text.includes('"t"'))).toBe(true);
	});

	it("refuses new clients once the scope has ended", async () => {
		const scope = createHyperdriveScope(binding, { createSql: () => fakeSql().sql });
		await scope.drainAndEnd();
		expect(() => scope.serviceClient()).toThrow(/already ended/);
	});

	it("leaves bodiless responses alone", () => {
		const scope = createHyperdriveScope(binding, { createSql: () => fakeSql().sql });
		const response = new Response(null, { status: 204 });
		expect(scope.trackResponse(response)).toBe(response);
	});
});
