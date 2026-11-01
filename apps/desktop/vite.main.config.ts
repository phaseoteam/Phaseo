import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

/**
 * The version and commit this build comes from, so Triage can fetch the exact source (src/main/buildInfo.ts). CI may pass
 * PHASEO_BUILD_COMMIT; otherwise Git answers, and a build with uncommitted changes is marked dirty. The version is the package's:
 * Electron reports its own when a script launches the bundle (the smoke and preview scripts).
 */
function buildStamp() {
	const git = (args: string[]) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim(); } catch { return ""; } };
	const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;
	const given = process.env.PHASEO_BUILD_COMMIT?.trim(), commit = given || git(["rev-parse", "HEAD"]);
	if (!/^[0-9a-f]{40}$/.test(commit)) return { version, builtAt: new Date().toISOString() };
	const dirty = !given && git(["status", "--porcelain", "--untracked-files=no"]) !== "";
	return { version, commit, ...(dirty ? { dirty } : {}), builtAt: new Date().toISOString() };
}

export default defineConfig({
	define: { __PHASEO_BUILD__: JSON.stringify(buildStamp()) },
	// The main process is Node: without this, packages with a browser build (ws) bundle their browser stub.
	resolve: { conditions: ["node"], mainFields: ["module", "main"] },
	build: {
		outDir: "dist/main",
		emptyOutDir: true,
		lib: {
			// The store is also its own entry, so smoke fixtures seed chats through it (scripts/fixtures/workspaceFixture.mjs).
			entry: { index: "src/main/index.ts", pdfWorker: "src/main/pdfWorker.mjs", usageWorker: "src/main/usageWorker.ts", workspaceStore: "src/main/workspaceStore.ts" },
			formats: ["es"],
			fileName: (_format, name) => `${name}.mjs`,
		},
		rollupOptions: {
			platform: "node",
			external: ["electron", "node-pty", "@cursor/sdk", /^@modelcontextprotocol\/sdk(?:\/|$)/, ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
		},
	},
});
