import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";

/**
 * The commit this build comes from, so Triage can fetch the exact source (src/main/buildInfo.ts). CI may pass
 * PHASEO_BUILD_COMMIT; otherwise Git answers, and a build with uncommitted changes is marked dirty.
 */
function buildStamp() {
	const git = (args: string[]) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim(); } catch { return ""; } };
	const given = process.env.PHASEO_BUILD_COMMIT?.trim(), commit = given || git(["rev-parse", "HEAD"]);
	if (!/^[0-9a-f]{40}$/.test(commit)) return { builtAt: new Date().toISOString() };
	const dirty = !given && git(["status", "--porcelain", "--untracked-files=no"]) !== "";
	return { commit, ...(dirty ? { dirty } : {}), builtAt: new Date().toISOString() };
}

export default defineConfig({
	define: { __PHASEO_BUILD__: JSON.stringify(buildStamp()) },
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
			external: ["electron", "node-pty", "@cursor/sdk", /^@modelcontextprotocol\/sdk(?:\/|$)/, ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
		},
	},
});
