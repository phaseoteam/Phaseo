import { createRequire } from "node:module";
import { readFile, readdir, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const visited = new Set(); const notices = [];
async function collect(name, from) {
	const require = createRequire(path.join(from, "package.json"));
	let directory;
	for (const searchPath of require.resolve.paths(name) ?? []) {
		const candidate = path.join(searchPath, name);
		try { if (JSON.parse(await readFile(path.join(candidate, "package.json"), "utf8")).name === name) { directory = candidate; break; } } catch { /* Try the next module search directory. */ }
	}
	if (!directory) throw new Error(`Cannot locate licence metadata for ${name}`);
	directory = await realpath(directory);
	if (visited.has(directory)) return; visited.add(directory);
	const packageManifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
	if (!name.startsWith("@phaseo/")) {
		const licenseFiles = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name));
		const texts = await Promise.all(licenseFiles.map(async entry => `${entry.name}\n${await readFile(path.join(directory, entry.name), "utf8")}`));
		notices.push({ name: `${name}@${packageManifest.version}`, text: `Licence: ${typeof packageManifest.license === "string" ? packageManifest.license : JSON.stringify(packageManifest.license ?? "See package licence")}${packageManifest.homepage ? `\nSource: ${packageManifest.homepage}` : ""}\n\n${texts.join("\n\n")}` });
	}
	for (const dependency of Object.keys(packageManifest.dependencies ?? {})) await collect(dependency, directory);
}
for (const name of [...Object.keys(manifest.dependencies), "react", "react-dom", "lucide-react"]) await collect(name, root);
notices.push({ name: "Mozilla PDF.js (bundled by unpdf)", text: `Copyright Mozilla Foundation\nSource: https://github.com/mozilla/pdf.js\n\n${await readFile(path.join(root, "licenses", "LICENSE.pdfjs.txt"), "utf8")}` });
await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "dist", "THIRD-PARTY-NOTICES.txt"), "Phaseo desktop — third-party software notices\n\n" + notices.sort((a, b) => a.name.localeCompare(b.name)).map(notice => `${notice.name}\n${"=".repeat(notice.name.length)}\n${notice.text}`).join("\n\n"));
console.log(`Preserved notices for ${notices.length} dependency packages.`);
