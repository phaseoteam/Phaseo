import { describe, expect, it, vi } from "vitest";
import { launchOnWorker, windowsCredentialEncryption } from "./windowsCredentialEncryption";
describe("credential helper thread", () => {
 it("starts the helper from a worker thread and returns its output, input and failures", async () => {
  const echo = await launchOnWorker(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { timeout: 20_000, windowsHide: true }, "c2VjcmV0");
  expect(echo).toEqual({ stdout: "c2VjcmV0", stderr: "" });
  const failed = await launchOnWorker(process.execPath, ["-e", "process.stderr.write('phaseo-credential:input\\n'); process.exit(3)"], { timeout: 20_000, windowsHide: true }, "");
  expect(failed).toEqual({ failed: { killed: false }, stdout: "", stderr: "phaseo-credential:input\n" });
  const runs = await Promise.all(["a", "b", "c"].map(input => launchOnWorker(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { timeout: 20_000, windowsHide: true }, input)));
  expect(runs.map(run => run.stdout)).toEqual(["a", "b", "c"]);
 }, 60_000);
});
describe("Windows credential protection", () => {
 it.skipIf(process.platform !== "win32")("keeps the event loop responsive while native protection is running", async () => {
  let ticks = 0; const timer = setInterval(() => { ticks++; }, 10);
  try { await windowsCredentialEncryption({ available: () => true, encrypt: () => Buffer.alloc(0), decrypt: () => "" }).encrypt("owned-responsive-credential"); expect(ticks).toBeGreaterThan(0); }
  finally { clearInterval(timer); }
 }, 35_000);
 it.skipIf(process.platform !== "win32")("round-trips owned credentials through independent DPAPI providers and preserves legacy reads", async () => {
  const decrypt = vi.fn(() => "legacy-owned"), fallback = { available: () => true, encrypt: () => Buffer.from("legacy"), decrypt };
  const written = await windowsCredentialEncryption(fallback).encrypt("owned-credential-🦊");
  expect(written.toString("utf8")).not.toContain("owned-credential"); expect(written.subarray(0, Buffer.byteLength("phaseo-dpapi-v1\0")).toString()).toBe("phaseo-dpapi-v1\0");
  const next = windowsCredentialEncryption(fallback); expect(await next.decrypt(written)).toBe("owned-credential-🦊"); expect(decrypt).not.toHaveBeenCalled(); expect(await next.decrypt(Buffer.from("legacy"))).toBe("legacy-owned"); expect(decrypt).toHaveBeenCalledOnce();
  const damaged = Buffer.from(written); damaged[damaged.length - 1] ^= 1; await expect(next.decrypt(damaged)).rejects.toThrow("protection failed");
 }, 100_000);
});
