import { readdirSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export function fingerprint() {
  const files = readdirSync(resolve("src"), {recursive:true,withFileTypes:true}).filter(f=>f.isFile() && f.name.endsWith(".ts")).map(f=>join(f.parentPath,f.name)).sort();
  const source = createHash("sha256");
  for(const file of files) {source.update(relative(resolve("src"),file).replaceAll("\\","/"));source.update(readFileSync(file));}
  const simulator = createHash("sha256");
  for(const file of readdirSync(resolve("scripts/routing-simulator")).filter(f=>/\.(ts|json)$/.test(f)).sort()) {simulator.update(file);simulator.update(readFileSync(resolve("scripts/routing-simulator",file)));}
  return {sourceSha256:source.digest("hex"),simulatorSha256:simulator.digest("hex"),dependencyLockSha256:createHash("sha256").update(readFileSync(resolve("../../pnpm-lock.yaml"))).digest("hex"),gitHead:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),node:process.version};
}
