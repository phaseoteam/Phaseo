import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { lazySchema } from "./lazy-schema";

describe("lazySchema", () => {
	it("builds once, on first use, and behaves like the built schema", () => {
		const build = vi.fn(() => z.object({ name: z.string(), count: z.number().optional() }));
		const schema = lazySchema(build);
		expect(build).not.toHaveBeenCalled();

		expect(schema.safeParse({ name: "a" }).success).toBe(true);
		expect(schema.safeParse({ name: 1 }).success).toBe(false);
		expect(schema instanceof z.ZodObject).toBe(true);
		expect(Object.keys(schema.shape)).toEqual(["name", "count"]);
		expect(build).toHaveBeenCalledTimes(1);
	});

	it("composes inside other schemas without building until they parse", () => {
		const buildInner = vi.fn(() => z.string().min(2));
		const inner = lazySchema(buildInner);
		const outer = lazySchema(() => z.object({ items: z.array(inner).optional() }));
		expect(buildInner).not.toHaveBeenCalled();

		expect(outer.parse({ items: ["ab"] })).toEqual({ items: ["ab"] });
		expect(outer.safeParse({ items: ["a"] }).success).toBe(false);
		expect(inner.optional().parse(undefined)).toBeUndefined();
		expect(buildInner).toHaveBeenCalledTimes(1);
	});
});
