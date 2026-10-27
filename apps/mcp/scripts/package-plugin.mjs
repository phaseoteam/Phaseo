// Package the Phaseo plugin.
//
// - dist/plugin/phaseo.tar.gz: the plugin directory as it is, for manual installs.
// - dist/plugin/phaseo-openai-<version>.zip: the package for OpenAI's plugin directory (ChatGPT and Codex). The
//   directory connects one MCP server per plugin and needs plugin-level review cases, so the ZIP keeps only the Phaseo
//   MCP, drops the per-host manifests that the root plugin.json overrides, and merges in plugin/openai-submission.json.
//
// Usage: node scripts/package-plugin.mjs [--demo-url <url>]
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const pluginRoot = "plugin/phaseo";
const SERVER = "phaseo";
// Read by other hosts only; the root plugin.json with extensions.com.openai takes precedence in the directory.
const EXCLUDED = new Set([".claude-plugin", ".codex-plugin", ".mcp.json"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const demoUrlIndex = process.argv.indexOf("--demo-url");
const demoUrl = demoUrlIndex === -1 ? undefined : process.argv[demoUrlIndex + 1];
if (demoUrlIndex !== -1 && !/^https:\/\//.test(demoUrl ?? "")) throw new Error("--demo-url needs an https URL");

await mkdir("dist/plugin", { recursive: true });
execFileSync("tar", ["-czf", "dist/plugin/phaseo.tar.gz", "-C", "plugin", "phaseo"], { stdio: "inherit" });
console.log("Plugin package: apps/mcp/dist/plugin/phaseo.tar.gz");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const manifest = await readJson(join(pluginRoot, "plugin.json"));
const mcp = await readJson(join(pluginRoot, "mcp.json"));
const submission = await readJson("plugin/openai-submission.json");

const server = mcp.mcpServers[SERVER];
if (!server) throw new Error(`mcp.json has no ${SERVER} server`);
if (Object.keys(server.headers ?? {}).length) throw new Error("the directory rejects MCP servers with headers");
const openai = manifest.extensions["com.openai"];
const review = { ...submission.review, ...(demoUrl ? { demo_recording_url: demoUrl } : {}) };
const directoryManifest = {
	...manifest,
	extensions: { ...manifest.extensions, "com.openai": { ...openai, review, publication: submission.publication } },
};
const directoryMcp = { ...mcp, mcpServers: { [SERVER]: server } };

const files = [];
async function collect(dir) {
	for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
		const path = join(dir, entry.name);
		const name = relative(pluginRoot, path).replaceAll("\\", "/");
		if (EXCLUDED.has(name)) continue;
		if (entry.isDirectory()) await collect(path);
		else if (name === "plugin.json") files.push({ name, data: Buffer.from(`${JSON.stringify(directoryManifest, null, 2)}\n`) });
		else if (name === "mcp.json") files.push({ name, data: Buffer.from(`${JSON.stringify(directoryMcp, null, 2)}\n`) });
		else files.push({ name, data: await readFile(path) });
	}
}
await collect(pluginRoot);
for (const file of files) {
	if (file.data.length > MAX_FILE_BYTES) throw new Error(`${file.name} is over the directory's 5 MiB file limit`);
	if (/(^|\/)(hooks|\.app\.json)(\/|$)/.test(file.name)) throw new Error(`${file.name}: the directory rejects hooks and app references`);
}

// A minimal ZIP writer (deflate, no extra fields), so packaging needs no dependency.
function zip(entries) {
	const local = [];
	const central = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const nameBytes = Buffer.from(name, "utf8");
		const compressed = deflateRawSync(data);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x0800, 6); // UTF-8 names
		header.writeUInt16LE(8, 8); // deflate
		header.writeUInt32LE(0x00210000, 10); // 1980-01-01 00:00, so the same input gives the same ZIP
		header.writeUInt32LE(crc32(data), 14);
		header.writeUInt32LE(compressed.length, 18);
		header.writeUInt32LE(data.length, 22);
		header.writeUInt16LE(nameBytes.length, 26);
		local.push(header, nameBytes, compressed);
		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		header.copy(entry, 6, 4, 30);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, nameBytes);
		offset += header.length + nameBytes.length + compressed.length;
	}
	const centralSize = central.reduce((sum, part) => sum + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, ...central, end]);
}

const output = `dist/plugin/phaseo-openai-${manifest.version}.zip`;
await writeFile(output, zip(files));
console.log(`OpenAI directory package: apps/mcp/${output} (${files.length} files, ${(await stat(output)).size} bytes)`);
if (!demoUrl) console.log("No --demo-url given: add the demo recording URL in the dashboard or rebuild with --demo-url.");
