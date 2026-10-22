import { describe, expect, it, vi } from "vitest";

import { SsrfError, isPrivateOrLocalhostLiteral, safeFetch, validatePublicUrlForFetch } from "./ssrf";

const publicDns = async () => ["93.184.216.34"];

function fakeFetch(responses: Record<string, () => Response>) {
	return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
		const make = responses[String(input)];
		if (!make) throw new Error(`unexpected fetch ${String(input)}`);
		return make();
	});
}

async function rejection(promise: Promise<unknown>): Promise<string> {
	const error = await promise.then(() => null, (caught: unknown) => caught);
	expect(error).toBeInstanceOf(SsrfError);
	return (error as SsrfError).code;
}

describe("SSRF guard", () => {
	it("rejects private, loopback and mapped IPv6 literals", () => {
		for (const host of ["127.0.0.1", "10.1.2.3", "100.64.0.1", "169.254.169.254", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[64:ff9b::a00:1]", "[fd00::1]", "localhost", "api.localhost"]) {
			expect(isPrivateOrLocalhostLiteral(host), host).toBe(true);
		}
		for (const host of ["93.184.216.34", "[2606:4700::1111]", "mcp.linear.app"]) {
			expect(isPrivateOrLocalhostLiteral(host), host).toBe(false);
		}
	});

	it("rejects hostnames whose DNS answers include a private address", async () => {
		await expect(validatePublicUrlForFetch("https://rebind.example/mcp", {
			resolveAddresses: async () => ["93.184.216.34", "10.0.0.5"],
		})).resolves.toEqual({ ok: false, reason: "url_private_network_not_allowed" });
		await expect(validatePublicUrlForFetch("https://empty.example/mcp", {
			resolveAddresses: async () => [],
		})).resolves.toEqual({ ok: false, reason: "url_dns_resolution_failed" });
		await expect(validatePublicUrlForFetch("http://plain.example/mcp", {
			resolveAddresses: publicDns,
		})).resolves.toEqual({ ok: false, reason: "url_must_use_https" });
	});

	it("re-checks every redirect hop and refuses one that points at a private address", async () => {
		const fetch = fakeFetch({
			"https://public.example/start": () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }),
		});
		expect(await rejection(safeFetch("https://public.example/start", undefined, { resolveAddresses: publicDns, fetch }))).toBe("ssrf_url_private_network_not_allowed");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("drops credentials when a redirect leaves the original origin", async () => {
		const fetch = fakeFetch({
			"https://a.example/start": () => new Response(null, { status: 307, headers: { location: "/same" } }),
			"https://a.example/same": () => new Response(null, { status: 302, headers: { location: "https://b.example/next" } }),
			"https://b.example/next": () => new Response("ok"),
		});
		const response = await safeFetch("https://a.example/start", { headers: { authorization: "Bearer secret", accept: "application/json" } }, { resolveAddresses: publicDns, fetch });
		expect(await response.text()).toBe("ok");
		const headersFor = (index: number) => new Headers(fetch.mock.calls[index]?.[1]?.headers);
		expect(headersFor(1).get("authorization")).toBe("Bearer secret");
		expect(headersFor(2).get("authorization")).toBeNull();
		expect(headersFor(2).get("accept")).toBe("application/json");
	});

	it("does not follow redirects for POST and stops after maxRedirects", async () => {
		const redirect = () => new Response(null, { status: 307, headers: { location: "https://a.example/loop" } });
		const post = await safeFetch("https://a.example/loop", { method: "POST", body: "{}" }, { resolveAddresses: publicDns, fetch: fakeFetch({ "https://a.example/loop": redirect }) });
		expect(post.status).toBe(307);
		expect(await rejection(safeFetch("https://a.example/loop", undefined, { resolveAddresses: publicDns, maxRedirects: 2, fetch: fakeFetch({ "https://a.example/loop": redirect }) }))).toBe("ssrf_too_many_redirects");
	});

	it("caps the response body by declared length and while streaming", async () => {
		const declared = fakeFetch({ "https://a.example/big": () => new Response("x".repeat(20), { headers: { "content-length": "20" } }) });
		expect(await rejection(safeFetch("https://a.example/big", undefined, { resolveAddresses: publicDns, maxBytes: 10, fetch: declared }))).toBe("ssrf_response_too_large");

		const streamed = fakeFetch({
			"https://a.example/stream": () => new Response(new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("x".repeat(8)));
					controller.enqueue(new TextEncoder().encode("x".repeat(8)));
					controller.close();
				},
			})),
		});
		const response = await safeFetch("https://a.example/stream", undefined, { resolveAddresses: publicDns, maxBytes: 10, fetch: streamed });
		expect(await rejection(response.text())).toBe("ssrf_response_too_large");
	});

	it("times out slow upstreams", async () => {
		const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
		}));
		expect(await rejection(safeFetch("https://slow.example/", undefined, { resolveAddresses: publicDns, timeoutMs: 20, fetch }))).toBe("ssrf_timeout");
	});
});
