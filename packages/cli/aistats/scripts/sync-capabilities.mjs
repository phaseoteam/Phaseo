import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../../../shared/capabilities/index.ts");
const targetPath = path.resolve(__dirname, "../src/generated/capabilities.ts");

const source = await readFile(sourcePath, "utf8");
const output = `// Generated from ../../../shared/capabilities/index.ts\n${source}`;

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, output, "utf8");
