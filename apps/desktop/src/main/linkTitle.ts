import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { BlockList } from "node:net";

const privateNetworks = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateNetworks.addSubnet(address, prefix, "ipv4");
export function publicTitleAddress(address: string) { return !privateNetworks.check(address, "ipv4"); }
export function titleFromHtml(html: string) {
	const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
	return title?.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name] ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined;
}

async function readTitle(value: string, redirects = 0): Promise<string | undefined> {
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || redirects > 3) return;
	const addresses = await lookup(url.hostname, { family: 4, all: true });
	if (!addresses.length || addresses.some(item => !publicTitleAddress(item.address))) return;
	return new Promise((resolve, reject) => {
		const request = get(url, { agent: false, family: 4, lookup: (_host, _options, done) => done(null, addresses[0].address, 4), headers: { Accept: "text/html", "User-Agent": "Phaseo-Desktop-Link-Preview" } }, response => {
			if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				response.resume(); void readTitle(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject); return;
			}
			if (response.statusCode !== 200 || !response.headers["content-type"]?.includes("text/html")) { response.resume(); resolve(undefined); return; }
			const chunks: Buffer[] = []; let bytes = 0;
			response.on("data", (chunk: Buffer) => { const remaining = 128 * 1024 - bytes; chunks.push(chunk.subarray(0, remaining)); bytes += chunk.length; if (bytes >= 128 * 1024) { resolve(titleFromHtml(Buffer.concat(chunks).toString("utf8"))); response.destroy(); } });
			response.on("end", () => resolve(titleFromHtml(Buffer.concat(chunks).toString("utf8")))); response.on("error", reject);
		});
		request.setTimeout(5000, () => request.destroy(new Error("Link title timed out."))); request.on("error", reject);
	});
}

const cache = new Map<string, { at: number; result: Promise<string | undefined> }>();
export function linkTitle(value: string) {
	if (value.length > 8192) return Promise.resolve(undefined);
	const previous = cache.get(value);
	if (previous && Date.now() - previous.at < 10 * 60_000) return previous.result;
	const result = readTitle(value).catch(() => undefined);
	cache.delete(value); cache.set(value, { at: Date.now(), result });
	if (cache.size > 256) cache.delete(cache.keys().next().value!);
	return result;
}
