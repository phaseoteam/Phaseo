import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractPath = path.join(root, "packages/sdk/core-contract.json");
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const failures = [];

for (const [sdk, files] of Object.entries(contract.surfaces)) {
  for (const [relativePath, requiredTokens] of Object.entries(files)) {
    let source;
    try {
      source = await readFile(path.join(root, relativePath), "utf8");
    } catch (error) {
      failures.push(`${sdk}: missing ${relativePath} (${error.code ?? error.message})`);
      continue;
    }
    for (const token of requiredTokens) {
      if (!source.includes(token)) failures.push(`${sdk}: ${relativePath} is missing ${JSON.stringify(token)}`);
    }
  }
}

if (failures.length) {
  console.error("SDK core contract validation failed:\n" + failures.map(failure => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`SDK core contract v${contract.version} validated across ${Object.keys(contract.surfaces).length} SDKs.`);
