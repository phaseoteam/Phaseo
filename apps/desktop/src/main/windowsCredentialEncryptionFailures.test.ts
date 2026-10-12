import { describe, expect, it, vi } from "vitest";
const helper = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: helper.execute }));
import { windowsCredentialEncryption } from "./windowsCredentialEncryption";
describe("credential helper diagnostics", () => {
 it.skipIf(process.platform !== "win32").each(["startup", "runtime", "input", "protected", "output"])("reports only the fixed %s stage on process timeout", async stage => {
  const write = vi.fn(); helper.execute.mockImplementation((_executable, _args, _options, callback) => { callback(Object.assign(new Error("owned-secret must not escape"), { killed: true }), "owned-secret", stage === "startup" ? "owned-secret" : 'phaseo-credential:'+stage+'\r\nowned-secret'); return { stdin: { on: () => {}, end: write } }; });
  const provider = windowsCredentialEncryption({ available: () => true, encrypt: () => Buffer.alloc(0), decrypt: () => "" });
  await expect(provider.encrypt("owned-secret")).rejects.toThrow('Windows credential protection failed during '+stage+' (process deadline). No credential was returned.');
  expect(write).toHaveBeenCalledWith(Buffer.from("owned-secret").toString("base64"));
  expect(JSON.stringify(helper.execute.mock.calls.at(-1)?.slice(0, 3))).not.toContain("owned-secret");
  expect(helper.execute.mock.calls.at(-1)?.[2]).toEqual(expect.objectContaining({ timeout: 30_000, windowsHide: true }));
 });
 it.skipIf(process.platform !== "win32")("discards arbitrary helper errors and invalid output", async () => {
  helper.execute.mockImplementation((_executable, _args, _options, callback) => { callback(null, "owned-private-invalid-output", "owned-private-stderr"); return { stdin: { on: () => {}, end: () => {} } }; });
  await expect(windowsCredentialEncryption({ available: () => true, encrypt: () => Buffer.alloc(0), decrypt: () => "" }).encrypt("owned-secret")).rejects.toThrow("Windows credential protection failed. No credential was returned.");
 });
});
