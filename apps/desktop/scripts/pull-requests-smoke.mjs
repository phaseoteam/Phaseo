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
let files,filesPages=0,filesRead=0;
if(detail&&process.argv.includes("--files")){
 await build({configFile:false,logLevel:"silent",build:{target:"node24",outDir:path.join(directory,"files-bundle"),emptyOutDir:false,lib:{entry:path.join(root,"src/main/projectPullRequestFiles.ts"),formats:["es"],fileName:()=>"files.mjs"},rolldownOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`)]}}});
 const {projectPullRequestFiles}=await import(pathToFileURL(path.join(directory,"files-bundle/files.mjs")).href);
 files=await projectPullRequestFiles(repository,{number:detail.number,page:1,headOid:detail.headOid,baseOid:detail.baseOid});assert.equal(files.total,detail.changedFiles);assert.ok(files.files.length<=100);assert.equal(files.headOid,detail.headOid);
 filesPages=1;filesRead=files.files.length;let currentFiles=files;while(currentFiles.hasNext){filesPages++;currentFiles=await projectPullRequestFiles(repository,{number:detail.number,page:filesPages,headOid:detail.headOid,baseOid:detail.baseOid});assert.equal(currentFiles.page,filesPages);assert.equal(currentFiles.total,files.total);filesRead+=currentFiles.files.length;}assert.equal(filesRead,Math.min(files.total,3000));
}
let contents;
if(files&&process.argv.includes("--contents")){
 await build({configFile:false,logLevel:"silent",build:{target:"node24",outDir:path.join(directory,"contents-bundle"),emptyOutDir:false,lib:{entry:path.join(root,"src/main/projectPullRequestContents.ts"),formats:["es"],fileName:()=>"contents.mjs"},rolldownOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`)]}}});
 const {projectPullRequestContents}=await import(pathToFileURL(path.join(directory,"contents-bundle/contents.mjs")).href);
 const file=files.files.find(file=>file.status==="modified"&&file.preview==="available"&&/\.(?:ts|tsx|md)$/.test(file.filename));assert.ok(file,"Expected an owned text file in the first page");
 contents=await projectPullRequestContents(repository,{number:detail.number,page:1,headOid:detail.headOid,baseOid:detail.baseOid,filename:file.filename});assert.match(contents.mergeBaseOid,/^[a-f0-9]{40}$/i);assert.equal(contents.headOid,detail.headOid);assert.ok(contents.oldFile&&contents.newFile);assert.notEqual(contents.oldFile.contents,contents.newFile.contents);
}
let reviewThreadsRead=0,reviewCommentsRead=0;
if(detail&&process.argv.includes('--threads')){
 await build({configFile:false,logLevel:'silent',build:{target:'node24',outDir:path.join(directory,'reviews-bundle'),emptyOutDir:false,lib:{entry:path.join(root,'src/main/projectPullRequestThreads.ts'),formats:['es'],fileName:()=> 'reviews.mjs'},rolldownOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`)]}}});
 const {projectPullRequestThreads}=await import(pathToFileURL(path.join(directory,'reviews-bundle/reviews.mjs')).href);
 const binding={number:detail.number,headOid:detail.headOid,baseOid:detail.baseOid};let cursor;const pages=new Set();
 do{const page=await projectPullRequestThreads(repository,{...binding,type:'threads',cursor});assert.equal(page.type,'threads');reviewThreadsRead+=page.threads.length;
  for(const thread of page.threads){let commentCursor;const commentPages=new Set();do{const comments=await projectPullRequestThreads(repository,{...binding,type:'comments',threadId:thread.id,cursor:commentCursor});assert.equal(comments.type,'comments');reviewCommentsRead+=comments.comments.length;commentCursor=comments.nextCursor;if(commentCursor){assert.ok(!commentPages.has(commentCursor));commentPages.add(commentCursor);assert.ok(commentPages.size<=1000);}}while(commentCursor);}
  cursor=page.nextCursor;if(cursor){assert.ok(!pages.has(cursor));pages.add(cursor);assert.ok(pages.size<=1000);}
 }while(cursor);
}

assert.equal(git(["status", "--porcelain"]), before);
assert.equal(git(["remote", "get-url", "origin"]).trim(), "https://github.com/phaseoteam/Phaseo.git");
console.log("PULL_REQUESTS_SMOKE", JSON.stringify({ installedCli: true, productionAdapter: true, readOnly: true, count: result.requests.length, limitReached: result.limitReached, pages: next ? 2 : 1, nextPageCount: next?.requests.length, detailsNumber: detail?.number, detailsState: detail?.state, detailsBodyLength: detail?.body.length, filesCount: files?.files.length, filesTotal: files?.total, filesHaveNext: files?.hasNext, filesPages, filesRead, reviewThreadsRead,reviewCommentsRead,contentsFile:contents?.newFile?.name, oldBytes:contents?Buffer.byteLength(contents.oldFile.contents):undefined,newBytes:contents?Buffer.byteLength(contents.newFile.contents):undefined,mergeBaseOid:contents?.mergeBaseOid }));
