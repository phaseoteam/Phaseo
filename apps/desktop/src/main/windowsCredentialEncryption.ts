import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CredentialEncryption } from "./secretVault";
const prefix = Buffer.from("phaseo-dpapi-v1\0");
/** DPAPI owns key durability; no newly generated Chromium profile key is needed. */
export function windowsCredentialEncryption(fallback: CredentialEncryption): CredentialEncryption {
 if (process.platform !== "win32") return fallback;
 const systemRoot = process.env.SystemRoot;
 const executable = systemRoot && path.isAbsolute(systemRoot) ? path.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe") : undefined;
 const transform = async (operation: "Protect" | "Unprotect", bytes: Buffer) => {
  if (!executable || !existsSync(executable)) throw new Error("Windows credential protection is unavailable.");
  const script = `Add-Type -AssemblyName System.Security; $credentialBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $credentialEntropy=[Text.Encoding]::UTF8.GetBytes('Phaseo desktop credentials v1'); $protectedBytes=[Security.Cryptography.ProtectedData]::${operation}($credentialBytes,$credentialEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))`;
  try {
   const result = (await new Promise<string>((resolve, reject) => {
    const child = execFile(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; " + script], { encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024, windowsHide: true, env: { SystemRoot: systemRoot, WINDIR: systemRoot } }, (error, stdout) => { if (error) reject(new Error("Credential helper failed.")); else resolve(stdout); });
    child.stdin?.on("error", () => reject(new Error("Credential helper input failed.")));
    child.stdin?.end(bytes.toString("base64"));
   })).trim();
   if ((!result && operation === "Protect") || result.length % 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(result)) throw new Error("Invalid credential protection result.");
   return Buffer.from(result, "base64");
  } catch { throw new Error("Windows credential protection failed. No credential was returned."); }
 };
 return { available: () => Boolean(executable && existsSync(executable)), encrypt: async value => Buffer.concat([prefix, await transform("Protect", Buffer.from(value, "utf8"))]), decrypt: async value => value.subarray(0, prefix.length).equals(prefix) ? new TextDecoder("utf-8", { fatal: true }).decode(await transform("Unprotect", value.subarray(prefix.length))) : fallback.decrypt(value) };
}
