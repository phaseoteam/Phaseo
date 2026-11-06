import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSecretReference } from "../shared/secretReferences";

type Run = (file: string, args: string[], options: { timeout: number; windowsHide: boolean; maxBuffer: number }) => Promise<{ stdout: string; stderr?: string }>;
const execute = promisify(execFile) as unknown as Run;

/** Values read lately, so a burst of chats starting together asks 1Password once; kept in memory only. */
const cache = new Map<string, { at: number; value: string }>();
const CACHE_MS = 10 * 60_000;

/**
 * The value a reference points at, read when it is needed and never saved: op://vault/item/field through the 1Password
 * CLI (which asks the person to unlock it), env:NAME from this computer's environment. Errors name the reference, never
 * a value.
 */
export async function resolveSecretReference(reference: string, run: Run = execute, now = Date.now()): Promise<string> {
	const hit = cache.get(reference);
	if (hit && now - hit.at < CACHE_MS) return hit.value;
	let value: string;
	if (reference.startsWith("env:")) {
		const found = process.env[reference.slice(4)];
		if (found === undefined) throw new Error(`The environment variable ${reference.slice(4)} is not set on this computer.`);
		value = found;
	} else {
		try { value = (await run("op", ["read", "--no-newline", reference], { timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout; }
		catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			const detail = code === "ENOENT" ? "the 1Password CLI (op) is not installed or not on the PATH" : ((error as { stderr?: string }).stderr ?? "").trim().split("\n").at(-1)?.replace(/^\[ERROR\][^:]*:?\s*/, "") || "1Password did not answer";
			throw new Error(`Could not read ${reference}: ${detail}.`, { cause: error });
		}
	}
	cache.set(reference, { at: now, value });
	return value;
}

/** The same record with each reference replaced by its value; plain values pass through. */
export async function resolveSecretValues(values: Record<string, string>, run: Run = execute): Promise<Record<string, string>> {
	const entries = await Promise.all(Object.entries(values).map(async ([name, value]) => [name, isSecretReference(value) ? await resolveSecretReference(value, run) : value] as const));
	return Object.fromEntries(entries);
}

export const clearSecretReferenceCache = () => cache.clear();
