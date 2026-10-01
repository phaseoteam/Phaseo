import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);
const directory = fileURLToPath(new URL("./", import.meta.url));
const scripts = (await readdir(directory))
    .filter(name => /^test-[a-z0-9-]+\.workerd\.mjs$/.test(name))
    .sort();
assert.ok(scripts.length > 0, "Native Workers regression fixtures must not be empty");

// Each fixture owns and disposes its Miniflare runtime. Keep processes isolated
// and bounded: cross-request IO ownership differs from Node/Vitest semantics.
for (const script of scripts) {
    test(script, { timeout: 120_000 }, async t => {
        try {
            await execute(process.execPath, [script], {
                cwd: directory, timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true,
            });
        } catch (error) {
            t.diagnostic(String(error.stdout ?? ""));
            t.diagnostic(String(error.stderr ?? ""));
            throw error;
        }
    });
}
