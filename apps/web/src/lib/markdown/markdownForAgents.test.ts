import { describe, expect, it, vi } from "vitest";
import { markdownRequest, prefersMarkdown, withMarkdownForAgents } from "./markdownForAgents";

const origin = "https://phaseo.app";
const html = (body: string) => `<html><head><title>Models</title></head><body><main>${body}</main></body></html>`;

function htmlResponse(body: string, init: ResponseInit = {}) {
	return new Response(html(body), { status: 200, ...init, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "content-length": "999", ...(init.headers as Record<string, string>) } });
}

describe("prefersMarkdown", () => {
	it.each([
		["text/markdown", true],
		["text/markdown, text/html, */*", true],
		["text/markdown, text/html;q=0.9", true],
		["text/html, text/markdown;q=0.5", false],
		["text/markdown;q=0", false],
		["text/html,application/xhtml+xml,*/*;q=0.8", false],
		["*/*", false],
		[null, false],
	])("%s -> %s", (accept, expected) => {
		expect(prefersMarkdown(accept)).toBe(expected);
	});
});

describe("markdownRequest", () => {
	const req = (path: string, accept?: string, method = "GET") => new Request(`${origin}${path}`, { method, headers: accept ? { accept } : {} });

	it("matches pages asked for as Markdown or with a .md suffix", () => {
		expect(markdownRequest(req("/models", "text/markdown"))).toEqual({ pagePath: "/models", viaSuffix: false });
		expect(markdownRequest(req("/models/openai/gpt-5-5.md"))).toEqual({ pagePath: "/models/openai/gpt-5-5", viaSuffix: true });
		expect(markdownRequest(req("/index.md"))).toEqual({ pagePath: "/", viaSuffix: true });
		expect(markdownRequest(req("/models", "text/markdown", "HEAD"))).not.toBeNull();
	});

	it("leaves browsers, the homepage, non-pages and writes alone", () => {
		expect(markdownRequest(req("/models", "text/html,*/*;q=0.8"))).toBeNull();
		expect(markdownRequest(req("/", "text/markdown"))).toBeNull();
		for (const path of ["/api/_web/models", "/_serverFn/abc", "/assets/app.js", "/docs/v1/quickstart", "/.well-known/phaseo-home.md", "/robots.txt", "/sitemap.xml", "/__markdown"]) {
			expect(markdownRequest(req(path, "text/markdown"))).toBeNull();
		}
		expect(markdownRequest(req("/models", "text/markdown", "POST"))).toBeNull();
	});
});

describe("withMarkdownForAgents", () => {
	it("renders the page as HTML and converts it", async () => {
		const fetchPage = vi.fn(async (_request: Request) => htmlResponse("<h1>Models</h1><p>All models</p>", { headers: { link: '<x>; rel="alternate"', etag: '"a"' } }));
		const response = await withMarkdownForAgents(new Request(`${origin}/models`, { headers: { accept: "text/markdown" } }), fetchPage);

		const forwarded = fetchPage.mock.calls[0][0];
		expect(forwarded.headers.get("accept")).toBe("text/html");
		expect(forwarded.headers.get("x-phaseo-complete-head")).toBe("1");
		expect(new URL(forwarded.url).pathname).toBe("/models");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
		expect(response.headers.get("vary")).toBe("Accept");
		expect(response.headers.get("cache-control")).toBe("public, max-age=60");
		expect(response.headers.get("content-signal")).toBe("ai-train=no, search=yes, ai-input=yes");
		expect(response.headers.get("link")).toBe(`<${origin}/models>; rel="canonical"`);
		expect(response.headers.get("content-length")).toBeNull();
		expect(response.headers.get("etag")).toBeNull();
		expect(Number(response.headers.get("x-markdown-tokens"))).toBeGreaterThan(0);
		expect(await response.text()).toBe(`---\ntitle: "Models"\nurl: ${origin}/models\n---\n\n# Models\n\nAll models\n`);
	});

	it("serves .md URLs without Vary and keeps the query string", async () => {
		const fetchPage = vi.fn(async (_request: Request) => htmlResponse("<p>Hi</p>"));
		const response = await withMarkdownForAgents(new Request(`${origin}/models/openai/gpt-5-5.md?tab=pricing`), fetchPage);
		expect(fetchPage.mock.calls[0][0].url).toBe(`${origin}/models/openai/gpt-5-5?tab=pricing`);
		expect(response.headers.get("vary")).toBeNull();
		expect(await response.text()).toContain("Hi");
	});

	it("keeps .md redirects on .md URLs", async () => {
		const fetchPage = vi.fn(async () => new Response(null, { status: 307, headers: { location: "/de-DE/models?x=1", "set-cookie": "PHASEO_LOCALE=de-DE" } }));
		const response = await withMarkdownForAgents(new Request(`${origin}/models.md`), fetchPage);
		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(`${origin}/de-DE/models.md?x=1`);
		expect(response.headers.get("set-cookie")).toBe("PHASEO_LOCALE=de-DE");
	});

	it("passes negotiated redirects and non-HTML responses through", async () => {
		const redirect = new Response(null, { status: 308, headers: { location: "/models/openai/gpt-5-5" } });
		expect(await withMarkdownForAgents(new Request(`${origin}/models/openai/gpt-5-5/old`, { headers: { accept: "text/markdown" } }), async () => redirect)).toBe(redirect);
		const json = new Response("{}", { headers: { "content-type": "application/json" } });
		expect(await withMarkdownForAgents(new Request(`${origin}/models`, { headers: { accept: "text/markdown" } }), async () => json)).toBe(json);
	});

	it("keeps the status of error pages", async () => {
		const response = await withMarkdownForAgents(new Request(`${origin}/models/nope/nope.md`), async () => htmlResponse("<h1>Not found</h1>", { status: 404 }));
		expect(response.status).toBe(404);
		expect(await response.text()).toContain("# Not found");
	});

	it("answers HEAD without a body", async () => {
		const response = await withMarkdownForAgents(new Request(`${origin}/models.md`, { method: "HEAD" }), async () => htmlResponse("<p>Hi</p>"));
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
		expect(await response.text()).toBe("");
	});

	it("sends /index.md to the hand-written homepage Markdown", async () => {
		const fetchPage = vi.fn(async (_request: Request) => new Response("# Phaseo", { headers: { "content-type": "text/markdown" } }));
		const response = await withMarkdownForAgents(new Request(`${origin}/index.md`), fetchPage);
		expect(fetchPage.mock.calls[0][0].headers.get("accept")).toBe("text/markdown");
		expect(new URL(fetchPage.mock.calls[0][0].url).pathname).toBe("/");
		expect(await response.text()).toBe("# Phaseo");
	});

	it("advertises the Markdown version on HTML pages", async () => {
		const response = await withMarkdownForAgents(new Request(`${origin}/models/openai/gpt-5-5`), async () => htmlResponse("<p>Hi</p>", { headers: { link: '<https://phaseo.app/de-DE/models>; rel="alternate"; hreflang="de-DE"' } }));
		expect(response.headers.get("link")).toBe(`<https://phaseo.app/de-DE/models>; rel="alternate"; hreflang="de-DE", <${origin}/models/openai/gpt-5-5.md>; rel="alternate"; type="text/markdown"`);
		expect(response.headers.get("vary")).toBe("Accept");
		const home = await withMarkdownForAgents(new Request(`${origin}/`), async () => htmlResponse("<p>Hi</p>"));
		expect(home.headers.get("link")).toBe(`<${origin}/index.md>; rel="alternate"; type="text/markdown"`);
	});

	it("does not advertise Markdown on non-page responses", async () => {
		const api = new Response("{}", { headers: { "content-type": "application/json" } });
		expect(await withMarkdownForAgents(new Request(`${origin}/api/_web/x`), async () => api)).toBe(api);
	});
});
