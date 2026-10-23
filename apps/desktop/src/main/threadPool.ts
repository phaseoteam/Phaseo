import { availableParallelism } from "node:os";

// Imported first by the main process. libuv sizes the thread pool shared by file reads and decompression (the Usage
// page's transcript readers among them) when it is first used, at 4 threads unless told otherwise; 8 read a first
// import of Claude Code and Codex history about a fifth faster. A size set in the environment is kept.
process.env.UV_THREADPOOL_SIZE ??= String(Math.min(8, Math.max(4, availableParallelism())));
