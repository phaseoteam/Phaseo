// Budgets for scripts/perf-budget.mjs. A change that needs more should say why in its pull request and raise the number
// here with the measurement. Memory, page size and DOM budgets are the real guard (they barely vary between runs); time
// budgets are loose, because hosted runners are slower and noisier than a developer's machine.
//
// Medians on a Windows desktop (Nov 2026), with a 2,000-turn chat of 16,000 tool steps: 1,360 KB before first paint,
// sidebar at 0.85 s, the long chat open in 0.27 s and 0.29 s a page, a turn on it peaking at 54 MB of main-process heap
// (it was 261 MB when a turn loaded the whole chat), 3,470 DOM nodes open and 5,824 after 30 pages back.
export const budgets = {
	// What the window loads before its first paint, and what the main process must not load at launch.
	"Scripts loaded before the first paint (KB)": 1500,
	"Main process packages loaded at launch": 0,

	"Launch to sidebar showing chats (ms)": 4000,
	"Launch to composer ready (ms)": 4500,
	"Main process heap, idle (MB)": 40,
	"Window heap, idle (MB)": 40,

	"Open the 2,000-turn chat (ms)": 3000,
	"Window heap with it open (MB)": 60,
	"DOM nodes with it open": 4500,
	"One page further back (ms)": 1500,
	"Window heap after 30 pages back (MB)": 70,
	"DOM nodes after 30 pages back": 7000,
	"Main process heap after 30 pages back (MB)": 40,

	"Turn on the long chat (ms)": 10000,
	"Main process heap during that turn, peak (MB)": 110,
	"Main process heap after that turn (MB)": 45,
	"History sent to the model for that turn (KB)": 400,

	"Switch between chats, median (ms)": 1000,
};

/** Packages that load on first use and must never be imported by the main bundle at launch. */
export const deferredPackages = ["@modelcontextprotocol/sdk", "@cursor/sdk"];
