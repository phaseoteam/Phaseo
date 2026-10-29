// Builds Factory as an app for this computer's platform, in a folder you can run or zip: Electron, the app
// in resources/app.asar, and the Claude Code the Agent SDK ships with unpacked beside it, since a program
// can't be run from inside the archive. Run `pnpm run build` first, or `pnpm run package`, which does both.
// Usage: node scripts/package.mjs [output folder]
import { createPackageWithOptions } from "@electron/asar";
import { rcedit } from "rcedit";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "out"));
const stage = path.join(out, "stage");
const name = "Phaseo Factory";
const platform = `${process.platform}-${process.arch}`;

const own = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
// The output folder is emptied first, but only one this script made: anything else there is left alone.
const marker = path.join(out, ".phaseo-factory-package");
if (existsSync(out) && (await readdir(out)).length && !existsSync(marker)) {
	console.error(`${out} already has files that this script didn't make, so nothing was changed. Choose an empty or new folder.`);
	process.exit(1);
}
await rm(out, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

// Vite bundles everything but Electron and the Agent SDK into dist, so those two are all the app needs at run time.
await cp(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });
await cp(path.join(root, "assets/icon.png"), path.join(stage, "assets/icon.png"));
await writeFile(path.join(stage, "package.json"), JSON.stringify({ name: own.name, productName: name, version: own.version, description: own.description, author: own.author, type: "module", main: own.main }, null, 2));
const sdk = await realpath(path.join(root, "node_modules/@anthropic-ai/claude-agent-sdk"));
const binary = path.dirname(createRequire(path.join(sdk, "package.json")).resolve(`@anthropic-ai/claude-agent-sdk-${platform}/package.json`));
await cp(sdk, path.join(stage, "node_modules/@anthropic-ai/claude-agent-sdk"), { recursive: true, dereference: true });
await cp(binary, path.join(stage, `node_modules/@anthropic-ai/claude-agent-sdk-${platform}`), { recursive: true, dereference: true });

// Electron itself, with the app in place of its default one.
const electron = path.join(root, "node_modules/electron/dist");
const app = path.join(out, name);
await cp(electron, app, { recursive: true, dereference: true });
const resources = process.platform === "darwin" ? path.join(app, "Electron.app/Contents/Resources") : path.join(app, "resources");
await rm(path.join(resources, "default_app.asar"), { force: true });
await createPackageWithOptions(stage, path.join(resources, "app.asar"), { unpackDir: `node_modules/@anthropic-ai/claude-agent-sdk-${platform}` });
// The icon Windows shows for the program and the macOS app bundle's; the window's own comes from assets.
if (process.platform === "win32") {
	const exe = path.join(app, `${name}.exe`);
	await rename(path.join(app, "electron.exe"), exe);
	await rcedit(exe, { icon: path.join(root, "assets/icon.ico"), "product-version": own.version, "file-version": own.version, "version-string": { ProductName: name, FileDescription: name, CompanyName: "Phaseo", OriginalFilename: `${name}.exe` } });
}
if (process.platform === "darwin") await cp(path.join(root, "assets/icon.icns"), path.join(resources, "electron.icns"));
await rm(stage, { recursive: true, force: true });

await writeFile(marker, "Made by apps/factory/scripts/package.mjs. Packaging again empties this folder.\n");

// The zip to attach to the GitHub release. Its name says the platform and architecture, which is how a running
// Factory picks its own download from the release.
const label = { win32: "win", darwin: "mac", linux: "linux" }[process.platform] ?? process.platform;
const zip = path.join(out, `Phaseo-Factory-${own.version}-${label}-${process.arch}.zip`);
const run = (command, args, cwd) => {
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });
	if (result.status !== 0) throw new Error(`${command} couldn't make ${zip}`);
};
if (process.platform === "win32") run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${app.replaceAll("'", "''")}' -DestinationPath '${zip.replaceAll("'", "''")}' -CompressionLevel Optimal`], out);
// ditto keeps the app bundle's links and permissions, which zip would break.
else if (process.platform === "darwin") run("ditto", ["-c", "-k", "--keepParent", app, zip], out);
else run("zip", ["-qry", zip, name], out);

console.log(`Packaged ${name} ${own.version} for ${platform} in ${app}`);
console.log(`Release file: ${zip}`);
