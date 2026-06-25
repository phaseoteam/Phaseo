import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../../../shared/capabilities/index.ts");
const targetPath = path.resolve(__dirname, "../src/generated/capabilities.ts");
const packageJsonPath = path.resolve(__dirname, "../package.json");
const metaTargetPath = path.resolve(__dirname, "../src/generated/meta.ts");

const source = await readFile(sourcePath, "utf8");
const output = `// Generated from ../../../shared/capabilities/index.ts\n${source}`;
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const metaOutput = `// Generated from ../package.json
export const CLI_PACKAGE_NAME = ${JSON.stringify(packageJson.name)};
export const CLI_VERSION = ${JSON.stringify(packageJson.version)};
`;

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, output, "utf8");
await writeFile(metaTargetPath, metaOutput, "utf8");
