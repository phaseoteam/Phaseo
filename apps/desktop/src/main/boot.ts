// The app's entry (package.json "main"). Node keeps V8's compiled code for the main bundle on disk, so launches after the
// first skip parsing and compiling it (about 200 ms of the 0.7–1 s the bundle takes to load). The cache is checked against
// each file's contents, so a new build simply compiles once more; a cache that cannot be opened is skipped.
import module from "node:module";
import os from "node:os";
import path from "node:path";

if (!process.env.NODE_COMPILE_CACHE) {
	try { module.enableCompileCache?.(path.join(os.tmpdir(), "phaseo-desktop-compile-cache")); } catch { /* Start without a cache. */ }
}
await import("./index");
