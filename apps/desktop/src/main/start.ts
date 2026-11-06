import { enableCompileCache } from "node:module";

// Node keeps the compiled main bundle on disk, so a launch after the first skips compiling ~3 MB of script (~90 ms
// before the window opens). It has to be on before the bundle is loaded, hence this entry. Electron waits for this
// import before emitting ready, so the app's pre-ready setup in index.ts still runs first.
enableCompileCache();
await import("./index");
