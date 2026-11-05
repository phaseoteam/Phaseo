import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlRenderLimits } from "../shared/htmlRender";

const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif", ".bmp": "image/bmp" };
const IMAGE_LIMIT = 2 * 1024 * 1024;
const imageSource = /(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)')/gi;

/** A local image path a page names: a file:// address, an absolute path, or one relative to the chat's folder. */
function localPath(source: string, folder: string): string | undefined {
	const value = source.trim();
	if (!value || /^(https?|data|blob):/i.test(value)) return undefined;
	if (/^file:/i.test(value)) { try { return fileURLToPath(value); } catch { return undefined; } }
	if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return undefined;
	return path.resolve(folder, decodeURI(value));
}

/**
 * Images a page names by file path go into the page as data, so it keeps showing them after the files move or are
 * deleted, and the sandboxed frame never reads the disk. Each image is at most 2 MB, and the page with them at most
 * htmlRenderLimits.embeddedBytes; an image that can't be read, or would go past either, is reported, not embedded.
 */
export async function embedLocalImages(html: string, folder: string) {
	const sources = [...html.matchAll(imageSource)].map(match => match[3] ?? match[4] ?? "");
	const data = new Map<string, string>(), missing: string[] = [];
	let total = new TextEncoder().encode(html).length;
	for (const source of new Set(sources)) {
		const file = localPath(source, folder);
		if (!file) continue;
		const type = types[path.extname(file).toLowerCase()];
		const size = type ? await stat(file).then(info => info.isFile() ? info.size : undefined, () => undefined) : undefined;
		if (!type || size === undefined || size > IMAGE_LIMIT || total + Math.ceil(size * 4 / 3) > htmlRenderLimits.embeddedBytes) { missing.push(source); continue; }
		const encoded = `data:${type};base64,${(await readFile(file)).toString("base64")}`;
		data.set(source, encoded); total += encoded.length;
	}
	if (!data.size) return { html, embedded: 0, missing };
	return { html: html.replace(imageSource, (whole, before: string, _quoted: string, double?: string, single?: string) => { const value = data.get(double ?? single ?? ""); return value ? `${before}"${value}"` : whole; }), embedded: data.size, missing };
}
