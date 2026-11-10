export type DesktopAnalyticsMessage = { type: "screen"; screen: string } | { type: "error"; name: string; stack: string };

export function desktopScreen(value: unknown): string | undefined {
  return typeof value === "string" && /^(?:chat|code|factory|inbox|usage|scheduled|pull-requests|settings\/(?:general|appearance|chat|diffs|threads|browser|source-control|worktrees|maintenance|notifications|accounts|usage|agents|mcp|code-hosts|outside-agents|keyboard|diagnostics|experimental|project|factory-(?:repositories|issues|pulls|notes|checking)))$/.test(value) ? value : undefined;
}
