import { describe, expect, it } from "vitest";
import { CANARY_BUCKET_COOKIE, CANARY_OVERRIDE_COOKIE, decideCanary, markResponse } from "./canary";

const env = (percent?: string) => ({ CANARY_HOSTS: "phaseo.app,www.phaseo.app", CANARY_PERCENT: percent });
const req = (path: string, init: { cookie?: string; method?: string; host?: string } = {}) =>
	new Request(`https://${init.host ?? "phaseo.app"}${path}`, { method: init.method ?? "GET", headers: init.cookie ? { cookie: init.cookie } : {} });
const target = (decision: ReturnType<typeof decideCanary>) => (decision.target === "control" ? "control" : decision.target);

describe("decideCanary", () => {
	it("always serves other hosts here (workers.dev, previews)", () => {
		expect(target(decideCanary(req("/", { host: "phaseo-web.example.workers.dev" }), env("0")))).toBe("this");
	});

	it("passes everything through at 0% and serves everything at 100% or when unset", () => {
		expect(target(decideCanary(req("/models", { cookie: `${CANARY_BUCKET_COOKIE}=0` }), env("0")))).toBe("previous");
		expect(target(decideCanary(req("/models"), env("100")))).toBe("this");
		expect(target(decideCanary(req("/models"), env(undefined)))).toBe("this");
	});

	it("keeps each path family on the site that owns it", () => {
		expect(target(decideCanary(req("/_next/static/chunks/app.js"), env("100")))).toBe("previous");
		expect(target(decideCanary(req("/_serverFn/abc"), env("0")))).toBe("this");
		expect(target(decideCanary(req("/assets/index.js"), env("0")))).toBe("this");
		expect(target(decideCanary(req("/api/i18n-full/en-GB"), env("0")))).toBe("this");
	});

	it("follows the bucket cookie, so raising the percentage only moves buckets in between", () => {
		const at = (bucket: number, percent: string) => target(decideCanary(req("/", { cookie: `${CANARY_BUCKET_COOKIE}=${bucket}` }), env(percent)));
		expect(at(4, "5")).toBe("this");
		expect(at(5, "5")).toBe("previous");
		expect(at(5, "25")).toBe("this");
		expect(at(4, "25")).toBe("this");
	});

	it("assigns a sticky bucket to new page visitors", () => {
		const decision = decideCanary(req("/"), env("25"), () => 0.1);
		expect(decision.target).toBe("this");
		expect(decision.target !== "control" && decision.setCookies[0]).toContain(`${CANARY_BUCKET_COOKIE}=10;`);
		expect(target(decideCanary(req("/"), env("25"), () => 0.9))).toBe("previous");
	});

	it("keeps webhooks and unbucketed API or write requests on the previous site until 100%", () => {
		expect(target(decideCanary(req("/api/webhooks/stripe-checkout", { method: "POST" }), env("50"), () => 0))).toBe("previous");
		expect(target(decideCanary(req("/api/favicon"), env("50"), () => 0))).toBe("previous");
		expect(target(decideCanary(req("/api/webhooks/stripe-checkout", { method: "POST" }), env("100")))).toBe("this");
	});

	it("lets the override cookie win over the percentage", () => {
		expect(target(decideCanary(req("/", { cookie: `${CANARY_OVERRIDE_COOKIE}=on` }), env("0")))).toBe("this");
		expect(target(decideCanary(req("/", { cookie: `${CANARY_OVERRIDE_COOKIE}=off; ${CANARY_BUCKET_COOKIE}=1` }), env("50")))).toBe("previous");
	});

	it("handles the control paths", async () => {
		const on = decideCanary(req("/_canary/on"), env("0"));
		expect(on.target).toBe("control");
		if (on.target !== "control") return;
		expect(on.response.headers.get("set-cookie")).toContain(`${CANARY_OVERRIDE_COOKIE}=on;`);
		expect(await on.response.json()).toMatchObject({ percent: 0, override: "on", served: "this" });
		const clear = decideCanary(req("/_canary/clear", { cookie: `${CANARY_OVERRIDE_COOKIE}=on` }), env("0"));
		if (clear.target !== "control") throw new Error("expected control");
		expect(clear.response.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(await clear.response.json()).toMatchObject({ override: null, served: "previous" });
		const unknown = decideCanary(req("/_canary/nope"), env("0"));
		expect(unknown.target === "control" && unknown.response.status).toBe(404);
	});
});

describe("markResponse", () => {
	it("labels the answering site and appends cookies without dropping existing ones", () => {
		const original = new Response("ok", { headers: { "set-cookie": "a=1; Path=/" } });
		const marked = markResponse(original, "previous", ["b=2; Path=/"]);
		expect(marked.headers.get("x-phaseo-web")).toBe("previous");
		expect(marked.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
	});
});
