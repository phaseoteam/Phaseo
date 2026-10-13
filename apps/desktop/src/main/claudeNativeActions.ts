import { query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveNativeCommand } from "./nativeProcess";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import type { Account } from "../shared/workspace";
import type { ClaudeAlias } from "./claudeModels";
import type { NativeAction, NativeActionCatalog, NativeActionEntry } from "../shared/nativeActions";
function identity(value: unknown) { return typeof value === "string" && value.length > 0 && value.length <= 200 && !value.startsWith("/") && !/\s/.test(value) && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? value : undefined; }
export function claudeNativeActionCatalog(value: unknown): NativeActionCatalog {
 if (!Array.isArray(value) || value.length > 1000) throw new Error("Claude returned an invalid or oversized command catalog.");
 const actions: NativeActionEntry[] = []; const owners = new Set<string>();
 for (const command of value) {
  if (!command || typeof command !== "object") throw new Error("Claude returned an invalid command."); const name = identity(command.name); if (!name) throw new Error("Claude returned an invalid command identity.");
  if (command.aliases !== undefined && (!Array.isArray(command.aliases) || command.aliases.length > 100)) throw new Error("Claude returned invalid command aliases.");
  const names = [...new Set([name, ...(command.aliases ?? [])])];
  for (const candidate of names) { const id = identity(candidate); if (!id || owners.has(id)) throw new Error("Claude returned invalid or ambiguous command identities."); owners.add(id);
   const hint = typeof command.argumentHint === "string" ? command.argumentHint.slice(0, 240) : undefined;
   actions.push({ kind: "command", id, name: id, description: typeof command.description === "string" ? command.description.slice(0, 1000) : "", ...(hint ? { argumentHint: hint } : {}) }); if (actions.length > 1000) throw new Error("Claude command catalog exceeds 1,000 entries.");
  }
 }
 return { actions: actions.sort((a, b) => a.name.localeCompare(b.name)) };
}
async function commandRequest<T>(request: () => Promise<T>, signal: AbortSignal, close: () => void): Promise<T> {
 signal.throwIfAborted(); let timer: ReturnType<typeof setTimeout>; let cancel!: () => void;
 const interrupted = new Promise<never>((_resolve, reject) => { const stop = (message: string) => { try { close(); } catch { /* Cancellation must still reject if the query already closed. */ } reject(new Error(message)); }; cancel = () => stop("Claude command discovery cancelled."); signal.addEventListener("abort", cancel, { once: true }); timer = setTimeout(() => stop("Claude command discovery timed out."), 15000); });
 try { return await Promise.race([request(), interrupted]); } finally { clearTimeout(timer!); signal.removeEventListener("abort", cancel); }
}
export async function confirmClaudeNativeAction(execution: Pick<Query, "supportedCommands" | "reinitialize" | "close">, action: NativeAction, signal: AbortSignal, refresh = false) {
 const commands = await commandRequest(async () => refresh ? (await execution.reinitialize()).commands : await execution.supportedCommands(), signal, () => execution.close()); const catalog = claudeNativeActionCatalog(commands);
 if (!catalog.actions.some(entry => entry.kind === action.kind && entry.id === action.id && entry.name === action.name)) throw new Error("This Claude action is no longer available.");
}
async function claudeDiscovery<T>(cwd: string, signal: AbortSignal, account: Account | undefined, read: (execution: Query) => Promise<T>): Promise<T> {
 signal.throwIfAborted(); const command = await resolveNativeCommand("claude"); signal.throwIfAborted(); const controller = new AbortController();
 const abort = () => controller.abort(); signal.addEventListener("abort", abort, { once: true }); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
 // eslint-disable-next-line require-yield -- Discovery holds input open without submitting a user message.
 async function* prompt(): AsyncGenerator<SDKUserMessage> { await gate; }
 let execution: Query | undefined;
 try {
  execution = query({ prompt: prompt(), options: { cwd, pathToClaudeCodeExecutable: command.executable, abortController: controller, persistSession: false, tools: [], strictMcpConfig: true, mcpServers: {}, settingSources: ["user", "project", "local"], ...(account?.configDirectory ? { env: { ...process.env, ...nativeAccountEnvironment(account) } } : {}), canUseTool: async () => ({ behavior: "deny", message: "Command discovery does not execute tools." }) } });
  if (signal.aborted) abort(); return await commandRequest(() => read(execution!), signal, () => { controller.abort(); execution!.close(); });
 } finally { signal.removeEventListener("abort", abort); controller.abort(); execution?.close(); release(); }
}
export async function claudeNativeActions(cwd: string, signal: AbortSignal, account?: Account): Promise<NativeActionCatalog> {
 return claudeNativeActionCatalog(await claudeDiscovery(cwd, signal, account, execution => execution.supportedCommands()));
}
export function claudeModelCatalog(value: unknown): ClaudeAlias[] {
 if (!Array.isArray(value) || value.length > 1000) throw Error("Claude returned an invalid model catalog.");
 const seen = new Set<string>();
 return value.map(item => {
  if (!item || typeof item !== "object" || typeof item.value !== "string" || !item.value || item.value.length > 1000 || Array.from(item.value as string).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || seen.has(item.value) || typeof item.displayName !== "string" || !item.displayName || item.displayName.length > 1000 || typeof item.description !== "string" || item.description.length > 4000) throw Error("Claude returned an invalid model.");
  seen.add(item.value);
  const resolved = typeof item.resolvedModel === "string" && /^[\w.[\]-]{1,200}$/.test(item.resolvedModel) ? item.resolvedModel : undefined;
  const levels = Array.isArray(item.supportedEffortLevels) ? item.supportedEffortLevels.filter((level: unknown): level is string => typeof level === "string" && level.length < 20).slice(0, 10) : undefined;
  return { id: item.value, name: item.displayName, description: item.description, ...(resolved ? { resolvedModel: resolved } : {}), ...(item.supportsEffort === true ? { supportsEffort: true } : {}), ...(levels?.length ? { supportedEffortLevels: levels } : {}), ...(item.supportsFastMode === true ? { supportsFastMode: true } : {}) };
 });
}
export async function claudeNativeModels(cwd: string, signal: AbortSignal, account?: Account): Promise<ClaudeAlias[]> {
 return claudeModelCatalog(await claudeDiscovery(cwd, signal, account, execution => execution.supportedModels()));
}
