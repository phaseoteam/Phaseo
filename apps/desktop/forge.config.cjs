const fs = require("node:fs/promises");
const path = require("node:path");
const { createRequire } = require("node:module");

// JavaScript dependencies are bundled by Vite. Copy the native PTY and its
// dependencies into a flat runtime tree instead of packaging pnpm symlinks.
async function copyRuntimePackage(name, from, destination, copied = new Set()) {
	if (copied.has(name)) return;
	copied.add(name);
	let source;
	for (const search of createRequire(path.join(from, "package.json")).resolve.paths(name) ?? []) {
		const candidate = path.join(search, name);
		try { if (JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8")).name === name) { source = await fs.realpath(candidate); break; } } catch { /* Continue searching installed packages. */ }
	}
	if (!source) throw new Error(`Cannot locate runtime package ${name}`);
	const manifest = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8"));
	await fs.cp(source, path.join(destination, "node_modules", name), { recursive: true, dereference: true, filter: file => !path.relative(source, file).split(path.sep).includes("node_modules") });
	for (const dependency of Object.keys(manifest.dependencies ?? {})) await copyRuntimePackage(dependency, source, destination, copied);
}

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
	// node-pty ships N-API prebuilds for supported desktop platforms.
	rebuildConfig: { onlyModules: [] },
	hooks: {
		packageAfterCopy: async (_config, buildPath, _version, platform, arch) => {
			const copied = new Set();
			await copyRuntimePackage("node-pty", __dirname, buildPath, copied);
			await copyRuntimePackage("@cursor/sdk", __dirname, buildPath, copied);
			await copyRuntimePackage(`@cursor/sdk-${platform}-${arch}`, path.dirname(require.resolve("@cursor/sdk")), buildPath, copied);
			await fs.access(path.join(buildPath, "node_modules/node-pty/prebuilds", `${platform}-${arch}`));
			const manifestPath = path.join(buildPath, "package.json");
			const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
			manifest.dependencies = { "node-pty": manifest.dependencies["node-pty"], "@cursor/sdk": manifest.dependencies["@cursor/sdk"] };
			delete manifest.devDependencies;
			await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
		},
	},
	packagerConfig: {
		prune: false,
		asar: { unpack: "**/node_modules/{node-pty,@cursor/sdk-*}/**" },
		appBundleId: "app.phaseo.desktop",
		appCategoryType: "public.app-category.developer-tools",
		name: "Phaseo",
		ignore: [
			/^\/node_modules(?:\/|$)/,
			/^\/(?:release|scripts|src)(?:\/|$)/,
			/^\/(?:eslint\.config\.js|tsconfig\.json|vite\..*\.config\.ts)$/,
		],
	},
	makers: [
		{
			name: "@electron-forge/maker-msix",
			platforms: ["win32"],
			config: {
				manifestVariables: {
					publisher: "CN=Phaseo",
					publisherDisplayName: "Phaseo",
					identityName: "Phaseo.Desktop",
				},
			},
		},
		{ name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] },
		{ name: "@electron-forge/maker-dmg", platforms: ["darwin"] },
		{
			name: "@electron-forge/maker-deb",
			platforms: ["linux"],
			config: { options: { maintainer: "Phaseo", homepage: "https://phaseo.app", categories: ["Development"] } },
		},
	],
};
