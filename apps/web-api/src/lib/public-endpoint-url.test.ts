import { afterEach, describe, expect, it, vi } from "vitest";
import { safeEndpoint } from "@/routes/account/settings-broadcast";
import { normalizeWebhookEndpointUrl } from "@/routes/account/settings-webhooks";
import { isPrivateOrLocalhostHost, validatePublicEndpointUrl, validatePublicEndpointUrlForDelivery } from "./public-endpoint-url";

const PRIVATE_URLS = [
	"https://[::ffff:7f00:1]/",
	"https://[::ffff:127.0.0.1]/",
	"https://100.64.0.1/",
	"https://198.18.0.1/",
	"https://198.19.255.1/",
	"https://[2002:a9fe:a9fe::]/",
	"https://[2001:0:4136:e378::1]/",
	"https://[fec0::1]/",
	"https://[64:ff9b::7f00:1]/",
	"https://169.254.169.254/",
	"https://localhost/",
];

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("public endpoint URL checks", () => {
	it.each(PRIVATE_URLS)("rejects %s", (url) => {
		expect(validatePublicEndpointUrl(url)).toEqual({ ok: false, reason: "private_network" });
	});

	it("allows public addresses and hostnames", () => {
		for (const url of ["https://hooks.example.com/x", "https://8.8.8.8/", "https://[2606:4700:4700::1111]/", "https://[2002:808:808::1]/"]) {
			expect(validatePublicEndpointUrl(url)).toMatchObject({ ok: true });
		}
		expect(isPrivateOrLocalhostHost("100.128.0.1")).toBe(false);
	});

	it("rejects hostnames that resolve to private addresses", async () => {
		await expect(validatePublicEndpointUrlForDelivery("https://hooks.example.com/x", {
			resolveAddresses: async () => ["93.184.216.34", "::ffff:a9fe:a9fe"],
		})).resolves.toEqual({ ok: false, reason: "private_network" });
		await expect(validatePublicEndpointUrlForDelivery("https://hooks.example.com/x", {
			resolveAddresses: async () => [],
		})).resolves.toEqual({ ok: false, reason: "dns_resolution_failed" });
		await expect(validatePublicEndpointUrlForDelivery("https://hooks.example.com/x", {
			resolveAddresses: async () => ["93.184.216.34"],
		})).resolves.toMatchObject({ ok: true });
	});

	it("queries DNS over HTTPS when forced", async () => {
		const fetchMock = vi.fn(async (input: string) => Response.json({
			Answer: new URL(input).searchParams.get("type") === "A" ? [{ data: "10.0.0.5" }] : [],
		}));
		vi.stubGlobal("fetch", fetchMock);
		await expect(validatePublicEndpointUrlForDelivery("https://internal.example.com/", { forceDns: true }))
			.resolves.toEqual({ ok: false, reason: "private_network" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("account webhook and Broadcast URLs", () => {
	it.each(["https://[::ffff:7f00:1]/", "https://100.64.0.1/", "https://198.18.0.1/"])("rejects %s", async (url) => {
		await expect(normalizeWebhookEndpointUrl(url)).rejects.toThrow("Webhook URL must not target a private network");
		expect(() => safeEndpoint(url)).toThrow("Private or loopback endpoint addresses are not allowed.");
	});

	it("keeps public webhook URLs and drops the fragment", async () => {
		await expect(normalizeWebhookEndpointUrl("https://hooks.example.com/x#frag")).resolves.toBe("https://hooks.example.com/x");
		await expect(normalizeWebhookEndpointUrl("http://hooks.example.com/x")).rejects.toThrow("Webhook URL must use https");
	});
});
