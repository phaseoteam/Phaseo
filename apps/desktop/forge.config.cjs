const fs = require("node:fs/promises");
const path = require("node:path");

// JavaScript dependencies are bundled by Vite. Copy the native PTY and its
// dependencies into a flat runtime tree instead of packaging pnpm symlinks.
async function copyRuntimePackage(name, from, destination, copied = new Set()) {
	if (copied.has(name)) return;
	copied.add(name);
	const source = await fs.realpath(path.dirname(require.resolve(`${name}/package.json`, { paths: [from] })));
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
			await copyRuntimePackage("node-pty", __dirname, buildPath);
			await fs.access(path.join(buildPath, "node_modules/node-pty/prebuilds", `${platform}-${arch}`));
			const manifestPath = path.join(buildPath, "package.json");
			const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
			manifest.dependencies = { "node-pty": manifest.dependencies["node-pty"] };
			delete manifest.devDependencies;
			await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
		},
	},
	packagerConfig: {
		prune: false,
		asar: { unpack: "**/node_modules/node-pty/**" },
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
