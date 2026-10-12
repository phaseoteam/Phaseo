import { describe, expect, it } from "vitest";
import { openCodeForm } from "./openCodeForms";

describe("OpenCode form snapshots", () => {
	it("normalizes unbounded JSON numbers without passing infinities into the renderer", () => {
		expect(openCodeForm({ id: "form", sessionID: "session", title: "Amount", fields: [{ key: "amount", type: "number", minimum: "-Infinity", maximum: "Infinity", default: 2 }] }).fields[0]).toEqual({ key: "amount", type: "number", minimum: undefined, maximum: undefined, default: 2 });
	});
	it("rejects non-finite defaults and impossible bounds", () => {
		expect(() => openCodeForm({ id: "form", sessionID: "session", title: "Amount", fields: [{ key: "amount", type: "number", default: "NaN" }] })).toThrow("unsupported numeric value");
		expect(() => openCodeForm({ id: "form", sessionID: "session", title: "Amount", fields: [{ key: "amount", type: "number", minimum: "Infinity" }] })).toThrow("unsupported numeric value");
	});
});
