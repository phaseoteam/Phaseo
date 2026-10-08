export type NativeAction = { kind: "command" | "skill"; id: string; name: string; arguments: string };
export type NativeActionEntry = Omit<NativeAction, "arguments"> & { description: string; path?: string; argumentHint?: string };
export type NativeActionCatalog = { actions: NativeActionEntry[]; errors?: string[] };
export function nativeActionPrefix(action: Pick<NativeAction, "kind" | "name">) { return `/${action.kind === "skill" ? "skill:" : ""}${action.name}`; }
export function nativeActionText(action: NativeAction) { return `${nativeActionPrefix(action)}${action.arguments ? ` ${action.arguments}` : ""}`; }
export function validateNativeAction(value: unknown): NativeAction {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid native action.");
 const action = value as NativeAction;
 if (!["command", "skill"].includes(action.kind) || typeof action.id !== "string" || !action.id || action.id.length > 2000 || Array.from(action.id).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof action.name !== "string" || !action.name || action.name.length > 200 || Array.from(action.name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof action.arguments !== "string" || action.arguments.length > 100000) throw new Error("Invalid native action.");
 if (nativeActionText(action).length > 100000) throw new Error("Native action exceeds the message limit.");
 return { kind: action.kind, id: action.id, name: action.name, arguments: action.arguments };
}

export function updateNativeActionText(action: NativeAction, text: string): NativeAction | undefined {
 const prefix = nativeActionPrefix(action); if (text !== prefix && !(text.startsWith(prefix) && /\s/.test(text.charAt(prefix.length)))) return undefined;
 return { ...action, arguments: text.slice(prefix.length).trimStart() };
}
