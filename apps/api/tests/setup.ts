import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const setupDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(setupDir, "..");
const envPath = path.resolve(rootDir, ".env.local");
const result = dotenv.config({ path: envPath });
if (!result.parsed) {
    console.log("Warning: No .env.local found or file is empty");
}
