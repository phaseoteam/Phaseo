import { afterEach, expect, it, vi } from "vitest";
import { isSecretReference } from "../shared/secretReferences";
import { clearSecretReferenceCache, resolveSecretReference, resolveSecretValues } from "./secretReferences";

afterEach(() => { clearSecretReferenceCache(); vi.unstubAllEnvs(); });

it("recognises 1Password and environment references, and nothing else", () => {
	expect(["op://Work/Agent/credential", "op://Private/GitHub token/password", "env:GITHUB_TOKEN"].map(isSecretReference)).toEqual([true, true, true]);
	expect(["Bearer abc", "op://only/two", "env:1BAD", "https://op.example"].map(isSecretReference)).toEqual([false, false, false, false]);
});

it("reads references when they are used, once in a while, and passes plain values through", async () => {
	vi.stubEnv("PHASEO_TEST_TOKEN", "from-env");
	const run = vi.fn(async () => ({ stdout: "from-1password" }));
	expect(await resolveSecretValues({ A: "op://Work/Agent/credential", B: "env:PHASEO_TEST_TOKEN", C: "plain" }, run)).toEqual({ A: "from-1password", B: "from-env", C: "plain" });
	await resolveSecretReference("op://Work/Agent/credential", run);
	expect(run).toHaveBeenCalledOnce();
	expect(run).toHaveBeenCalledWith("op", ["read", "--no-newline", "op://Work/Agent/credential"], expect.anything());
});

it("names the reference, never a value, when it cannot be read", async () => {
	const missing = Object.assign(new Error("spawn op ENOENT"), { code: "ENOENT" });
	await expect(resolveSecretReference("op://Work/Agent/credential", vi.fn(async () => { throw missing; }))).rejects.toThrow("Could not read op://Work/Agent/credential: the 1Password CLI (op) is not installed");
	await expect(resolveSecretReference("env:PHASEO_NOT_SET_ANYWHERE")).rejects.toThrow("PHASEO_NOT_SET_ANYWHERE is not set");
});
