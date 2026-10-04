import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

// Explicit live mode reads public repository metadata using the local CLI login.
// It never creates, modifies, reviews or merges a pull request.
if (!process.argv.includes("--live")) throw Error("Use --live to verify the installed GitHub CLI against phaseoteam/Phaseo.");
const directory = mkdtempSync(path.join(tmpdir(), "phaseo-pull-requests-"));
const repository = path.join(directory, "repository"); mkdirSync(repository);
const git = args => execFileSync("git", args, { cwd: repository, windowsHide: true, stdio: "pipe" }).toString();
git(["init", "-b", "fixture"]); git(["remote", "add", "origin", "https://github.com/phaseoteam/Phaseo.git"]);
const before = git(["status", "--porcelain"]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({ configFile: false, logLevel: "silent", build: { target: "node24", outDir: path.join(directory, "bundle"), emptyOutDir: false, lib: { entry: path.join(root, "src/main/projectPullRequests.ts"), formats: ["es"], fileName: () => "pull-requests.mjs" }, rolldownOptions: { external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)] } } });
const { projectPullRequests, projectPullRequest } = await import(pathToFileURL(path.join(directory, "bundle/pull-requests.mjs")).href);
const result = await projectPullRequests(repository);
assert.equal(result.repository, "phaseoteam/Phaseo"); assert.ok(result.requests.length <= 100);
for (const request of result.requests) assert.equal(request.url, `https://github.com/phaseoteam/Phaseo/pull/${request.number}`);
const next = result.nextCursor ? await projectPullRequests(repository, result.nextCursor) : undefined;
if (next) { assert.equal(next.repository, result.repository); assert.ok(next.requests.length <= 100); assert.notEqual(next.nextCursor, result.nextCursor); for (const request of next.requests) assert.equal(request.url, `https://github.com/phaseoteam/Phaseo/pull/${request.number}`); }
const detailNumber = process.argv.find(value => value.startsWith("--details="))?.slice(10);
const detail = detailNumber ? await projectPullRequest(repository, Number(detailNumber)) : undefined;
if (detail) { assert.equal(detail.number, Number(detailNumber)); assert.equal(detail.repository, "phaseoteam/Phaseo"); assert.match(detail.headOid, /^[a-f0-9]{40}$/i); assert.ok(detail.body.length <= 200000); }
assert.equal(git(["status", "--porcelain"]), before);
assert.equal(git(["remote", "get-url", "origin"]).trim(), "https://github.com/phaseoteam/Phaseo.git");
console.log("PULL_REQUESTS_SMOKE", JSON.stringify({ installedCli: true, productionAdapter: true, readOnly: true, count: result.requests.length, limitReached: result.limitReached, pages: next ? 2 : 1, nextPageCount: next?.requests.length, detailsNumber: detail?.number, detailsState: detail?.state, detailsBodyLength: detail?.body.length }));
