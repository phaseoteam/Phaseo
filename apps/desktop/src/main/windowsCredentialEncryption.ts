import { execFile, type ExecFileOptions } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { CredentialEncryption } from "./secretVault";
const prefix = Buffer.from("phaseo-dpapi-v1\0");

/** What the helper process left behind: whether it failed (and was killed at its deadline), and its output. */
export type HelperRun = { failed?: { killed: boolean }; inputFailed?: boolean; stdout: string; stderr: string };
/** Starts the helper process with `input` on stdin. */
export type HelperLaunch = (executable: string, args: string[], options: ExecFileOptions, input: string) => Promise<HelperRun>;

/** Starts the helper from the calling thread. */
export const launchHere: HelperLaunch = (executable, args, options, input) => new Promise(resolve => {
 const child = execFile(executable, args, { ...options, encoding: "utf8" }, (error, stdout, stderr) => resolve({ ...(error ? { failed: { killed: Boolean(error.killed) } } : {}), stdout: String(stdout), stderr: String(stderr) }));
 child.stdin?.on("error", () => resolve({ inputFailed: true, stdout: "", stderr: "" }));
 child.stdin?.end(input);
});

// The same launch, run on a worker thread. Starting a process blocks the thread that starts it until Windows lets it run,
// and an antivirus scan of a command line it has not seen recently holds that for 0.5–1.7 s. On the main thread that
// froze every window during startup, since the vault is read while the first window loads.
const workerSource = `const { execFile } = require("node:child_process"); const { parentPort } = require("node:worker_threads");
parentPort.on("message", ({ id, executable, args, options, input }) => {
 let settled = false; const reply = run => { if (!settled) { settled = true; parentPort.postMessage({ id, run }); } };
 const child = execFile(executable, args, { ...options, encoding: "utf8" }, (error, stdout, stderr) => reply({ ...(error ? { failed: { killed: Boolean(error.killed) } } : {}), stdout: String(stdout), stderr: String(stderr) }));
 child.stdin?.on("error", () => reply({ inputFailed: true, stdout: "", stderr: "" }));
 child.stdin?.end(input);
});`;
let helperThread: { worker: Worker; pending: Map<number, (run: HelperRun) => void>; idle?: NodeJS.Timeout } | undefined, nextRequest = 0;
export const launchOnWorker: HelperLaunch = (executable, args, options, input) => new Promise(resolve => {
 if (!helperThread) {
  const worker = new Worker(workerSource, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 32 } }), pending = new Map<number, (run: HelperRun) => void>(), thread = { worker, pending };
  worker.unref();
  worker.on("message", ({ id, run }: { id: number; run: HelperRun }) => { const settle = pending.get(id); pending.delete(id); settle?.(run); });
  // A thread that dies takes its requests with it: they fail like a helper that did not start.
  const fail = () => { if (helperThread === thread) helperThread = undefined; const settles = [...pending.values()]; pending.clear(); for (const settle of settles) settle({ failed: { killed: false }, stdout: "", stderr: "" }); };
  worker.on("error", fail); worker.on("exit", fail);
  helperThread = thread;
 }
 const thread = helperThread, id = nextRequest++;
 clearTimeout(thread.idle);
 thread.pending.set(id, run => { resolve(run); if (!thread.pending.size) thread.idle = setTimeout(() => {
  if (thread.pending.size) return;
  // Forget it first, so a request arriving while it shuts down starts a new thread instead of joining this one.
  if (helperThread === thread) helperThread = undefined;
  void thread.worker.terminate();
 }, 30_000).unref(); });
 thread.worker.postMessage({ id, executable, args, options, input });
});

/** DPAPI owns key durability; no newly generated Chromium profile key is needed. */
export function windowsCredentialEncryption(fallback: CredentialEncryption, launch: HelperLaunch = launchOnWorker): CredentialEncryption {
 if (process.platform !== "win32") return fallback;
 const systemRoot = process.env.SystemRoot;
 const executable = systemRoot && path.isAbsolute(systemRoot) ? path.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe") : undefined;
 const transform = async (operation: "Protect" | "Unprotect", bytes: Buffer) => {
  if (!executable || !existsSync(executable)) throw new Error("Windows credential protection is unavailable.");
  const script = `[Console]::Error.WriteLine("phaseo-credential:start"); [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); [Console]::Error.WriteLine("phaseo-credential:runtime"); $credentialBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Error.WriteLine("phaseo-credential:input"); $credentialEntropy=[Text.Encoding]::UTF8.GetBytes('Phaseo desktop credentials v1'); $protectedBytes=[Security.Cryptography.ProtectedData]::${operation}($credentialBytes,$credentialEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Error.WriteLine("phaseo-credential:protected"); [Console]::Out.Write([Convert]::ToBase64String($protectedBytes)); [Console]::Error.WriteLine("phaseo-credential:output"); exit 0`;
  try {
   const run = await launch(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; " + script], { timeout: 30_000, maxBuffer: 128 * 1024, windowsHide: true, env: { SystemRoot: systemRoot, WINDIR: systemRoot } }, bytes.toString("base64"));
   if (run.inputFailed) throw new Error("Credential helper input failed.");
   if (run.failed) { const stages = [...run.stderr.matchAll(/^phaseo-credential:(start|runtime|input|protected|output)\r?$/gm)]; const stage = stages.at(-1)?.[1] ?? "startup"; throw new Error(`Windows credential protection failed during ${stage}${run.failed.killed ? " (process deadline)" : ""}. No credential was returned.`); }
   const result = run.stdout.trim();
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
