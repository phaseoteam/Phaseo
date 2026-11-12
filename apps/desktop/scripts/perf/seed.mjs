// Seeds one template profile for the performance suite. Run under Electron's Node (ELECTRON_RUN_AS_NODE=1), so the
// database is written by the same SQLite build the app opens it with.
//   electron scripts/perf/seed.mjs <profile dir> <empty|standard|stress> <gateway url> [stress chats]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seedPreviewWorkspace, writeDemoCredential } from "../fixtures/previewWorkspace.mjs";

const [profile, kind, gateway, chats = "2000"] = process.argv.slice(2);
const started = performance.now();
mkdirSync(path.join(profile, "workspace"), { recursive: true });
// "empty" is a first launch: no chats, no account.
if (kind !== "empty") {
	await seedPreviewWorkspace(profile, { gateway, stress: kind === "stress" ? Number(chats) : 0 });
	// Signed in, so the window shows the composer rather than the sign-in card. The key only reaches the local gateway.
	writeDemoCredential(profile);
}
console.log(`seeded ${kind} in ${Math.round(performance.now() - started)} ms`);
