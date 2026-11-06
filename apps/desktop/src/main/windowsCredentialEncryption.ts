import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { runCredentialHelper, type CredentialHelperRequest, type CredentialHelperResult } from "./credentialWorker";
import type { CredentialEncryption } from "./secretVault";
const prefix = Buffer.from("phaseo-dpapi-v1\0");
/** The helper runs in a worker built from credentialWorker.ts, one for every request; it is started again if it stops. */
function helperWorker(script: string) {
 let worker: Worker | undefined, next = 0;
 const pending = new Map<number, (result: CredentialHelperResult) => void>();
 return (request: Omit<CredentialHelperRequest, "id">) => new Promise<CredentialHelperResult>(resolve => {
  if (!worker) {
   const started = worker = new Worker(script);
   started.unref();
   started.on("message", ({ id, ...result }: CredentialHelperResult & { id: number }) => { const done = pending.get(id); pending.delete(id); done?.(result); });
   const stop = () => { if (worker === started) worker = undefined; for (const done of pending.values()) done({ failed: true, killed: false, stdout: "", stderr: "" }); pending.clear(); };
   started.on("error", stop); started.on("exit", stop);
  }
  const id = next++; pending.set(id, resolve); worker.postMessage({ id, ...request } satisfies CredentialHelperRequest);
 });
}

/**
 * DPAPI owns key durability; no newly generated Chromium profile key is needed. With `workerScript`, the helper process
 * starts from a worker thread: starting it from the main thread froze the app for over a second on every launch.
 */
export function windowsCredentialEncryption(fallback: CredentialEncryption, workerScript?: string): CredentialEncryption {
 if (process.platform !== "win32") return fallback;
 const run = workerScript ? helperWorker(workerScript) : runCredentialHelper;
 const systemRoot = process.env.SystemRoot;
 const executable = systemRoot && path.isAbsolute(systemRoot) ? path.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe") : undefined;
 const transform = async (operation: "Protect" | "Unprotect", bytes: Buffer) => {
  if (!executable || !existsSync(executable)) throw new Error("Windows credential protection is unavailable.");
  const script = `[Console]::Error.WriteLine("phaseo-credential:start"); [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); [Console]::Error.WriteLine("phaseo-credential:runtime"); $credentialBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Error.WriteLine("phaseo-credential:input"); $credentialEntropy=[Text.Encoding]::UTF8.GetBytes('Phaseo desktop credentials v1'); $protectedBytes=[Security.Cryptography.ProtectedData]::${operation}($credentialBytes,$credentialEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Error.WriteLine("phaseo-credential:protected"); [Console]::Out.Write([Convert]::ToBase64String($protectedBytes)); [Console]::Error.WriteLine("phaseo-credential:output"); exit 0`;
  try {
   const outcome = await run({ executable, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; " + script], options: { encoding: "utf8", timeout: 30_000, maxBuffer: 128 * 1024, windowsHide: true, env: { SystemRoot: systemRoot, WINDIR: systemRoot } }, input: bytes.toString("base64") });
   if (outcome.inputFailed) throw new Error("Credential helper input failed.");
   if (outcome.failed) { const stages = [...outcome.stderr.matchAll(/^phaseo-credential:(start|runtime|input|protected|output)\r?$/gm)]; const stage = stages.at(-1)?.[1] ?? "startup"; throw new Error(`Windows credential protection failed during ${stage}${outcome.killed ? " (process deadline)" : ""}. No credential was returned.`); }
   const result = outcome.stdout.trim();
   if ((!result && operation === "Protect") || result.length % 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(result)) throw new Error("Invalid credential protection result.");
   return Buffer.from(result, "base64");
  } catch (error) {
   if (error instanceof Error && /^Windows credential protection failed during (startup|start|runtime|input|protected|output)( \(process deadline\))?\. No credential was returned\.$/.test(error.message)) throw error;
   // Do not attach raw helper errors: process diagnostics can contain private input/output.
   // eslint-disable-next-line preserve-caught-error
   throw new Error("Windows credential protection failed. No credential was returned.");
  }
 };
 return { available: () => Boolean(executable && existsSync(executable)), encrypt: async value => Buffer.concat([prefix, await transform("Protect", Buffer.from(value, "utf8"))]), decrypt: async value => value.subarray(0, prefix.length).equals(prefix) ? new TextDecoder("utf-8", { fatal: true }).decode(await transform("Unprotect", value.subarray(prefix.length))) : fallback.decrypt(value) };
}
