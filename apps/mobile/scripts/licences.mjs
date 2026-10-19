#!/usr/bin/env node
// Writes the app's open source licences (Account → Open source licences) from its production dependencies.
//
//   pnpm --filter @phaseo/mobile licences          regenerate src/features/account/licences.generated.json
//   pnpm --filter @phaseo/mobile licences:check    fail when the file doesn't match the installed packages
//
// `pnpm build` regenerates it first, and Jest (scripts/licences/licences.test.ts) fails when it's out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateLicenceData, OUTPUT, serialise } from "./licences/collect.ts";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(appDir, OUTPUT);
const next = serialise(generateLicenceData(appDir));
const data = JSON.parse(next);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== next) {
    console.error(`${OUTPUT} is out of date. Run \`pnpm --filter @phaseo/mobile licences\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUTPUT} is current (${data.packages.length} packages, ${data.texts.length} distinct texts).`);
} else {
  fs.writeFileSync(target, next);
  console.log(`Wrote ${OUTPUT}: ${data.packages.length} packages, ${data.texts.length} distinct texts, ${(Buffer.byteLength(next) / 1024).toFixed(1)} KB.`);
}
