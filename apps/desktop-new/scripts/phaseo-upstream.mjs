import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const metadata = JSON.parse(readFileSync(new URL("../PHASEO-FORK.json", import.meta.url), "utf8"));
const mode = process.argv[2] ?? "check", ref = process.argv[3] ?? "main";
if (!["check", "update"].includes(mode) || ref.startsWith("-") || !/^[a-zA-Z0-9_./-]+$/.test(ref)) throw new Error("Usage: upstream:check or upstream:update [tag-or-branch]");
if (mode === "update" && git("status", "--porcelain")) throw new Error("Commit or preserve working changes before importing an upstream update.");
git("fetch", metadata.upstream, ref);
const upstream = git("rev-parse", "FETCH_HEAD^{commit}");
if (mode === "check") { console.log(`Pinned baseline: ${metadata.revision}\nUpstream ${ref}: ${upstream}`); process.exit(0); }
execFileSync("git", ["subtree", "merge", "--prefix=apps/desktop-new", "--squash", "-m", `chore(desktop-new): merge T3 upstream ${ref}`, upstream], { cwd: root, stdio: "inherit" });
console.log("Review conflicts, update PHASEO-FORK.json and validate Connect remains absent before publishing.");
