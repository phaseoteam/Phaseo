import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// Archived fixture paths are used by compatibility validators and audit tools.
// They are not an input feed for the live database.
export const DATA_ROOT = process.env.DATA_ROOT
	? resolve(process.cwd(), process.env.DATA_ROOT)
	: resolve(__dirname, "../../../../packages/data/catalog/src/data");

export const DIR_ALIASES = resolve(DATA_ROOT, "aliases");
export const DIR_PROVIDERS = resolve(DATA_ROOT, "api_providers");
export const DIR_BENCHMARKS = resolve(DATA_ROOT, "benchmarks");
export const DIR_FAMILIES = resolve(DATA_ROOT, "families");
export const DIR_MODELS = resolve(DATA_ROOT, "models");
export const DIR_ORGS = resolve(DATA_ROOT, "organisations");
export const DIR_PRICING = resolve(DATA_ROOT, "pricing");
export const DIR_SUBSCRIPTION_PLANS = resolve(DATA_ROOT, "subscription_plans");
