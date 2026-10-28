export type PromptCommand = { name: string; description: string; scope: "global" | "project"; hash: string };
export type PromptCommandCatalog = { commands: PromptCommand[]; errors: string[] };
export type PromptCommandRequest =
 | { type: "list" }
 | { type: "preview"; scope: PromptCommand["scope"]; name: string; arguments: string }
 | { type: "save"; scope: PromptCommand["scope"]; name: string; description: string; template: string; expectedHash: string };
export type PromptCommandPreview = PromptCommand & { template: string; text: string };
export function expandPromptCommand(template: string, argumentsValue: string): string {
 const args = (argumentsValue.match(/"[^"]*"|'[^']*'|[^\s"']+/g) ?? []).map(value => value.replace(/^["']|["']$/g, ""));
 const placeholders = [...template.matchAll(/\$([1-9]\d*)/g)].map(value => Number(value[1])); const last = Math.max(0, ...placeholders);
 const expanded = template.replace(/\$([1-9]\d*)|\$ARGUMENTS/g, (placeholder, position: string | undefined) => position === undefined ? argumentsValue : Number(position) === last ? args.slice(Number(position) - 1).join(" ") : args[Number(position) - 1] ?? "");
 const result = !placeholders.length && !template.includes("$ARGUMENTS") && argumentsValue.trim() ? `${expanded}\n\n${argumentsValue}` : expanded;
 if (result.length > 100000) throw new Error("Expanded command exceeds the message limit.");
 return result.trim();
}
