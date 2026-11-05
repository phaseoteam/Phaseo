import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useSyncExternalStore } from "react";

// Inline is the default: tool results render as cards in the conversation and the
// full explorer opens only when the user asks for it.
export const bridge = new App(
  { name: "Phaseo", version: "0.2.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
);

export type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

export type BridgeState = {
  status: "connecting" | "connected" | "failed";
  context: McpUiHostContext | undefined;
  // True once the host has told us a tool call created this view (arguments or result).
  toolCall: boolean;
  result: ToolResult | undefined;
};

let state: BridgeState = {
  status: "connecting",
  context: undefined,
  toolCall: false,
  result: undefined,
};
const listeners = new Set<() => void>();

function update(next: Partial<BridgeState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

let fontsApplied = false;
function applyContext(context: McpUiHostContext | undefined) {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  // Use ChatGPT's own colours and font stack when the host provides them.
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts && !fontsApplied) {
    applyHostFonts(context.styles.css.fonts);
    fontsApplied = true;
  }
}

bridge.addEventListener("toolinput", () => update({ toolCall: true }));
bridge.addEventListener("toolresult", (result) =>
  update({ toolCall: true, result: result as ToolResult }),
);
// getHostContext() already holds the merged context when this fires.
bridge.addEventListener("hostcontextchanged", () => {
  const context = bridge.getHostContext();
  applyContext(context);
  update({ context });
});

void bridge
  .connect()
  .then(() => {
    const context = bridge.getHostContext();
    applyContext(context);
    update({ status: "connected", context, toolCall: state.toolCall || Boolean(context?.toolInfo) });
  })
  .catch(() => update({ status: "failed" }));

export function useBridge(): BridgeState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function canOpenFullscreen(context: McpUiHostContext | undefined): boolean {
  return Boolean(context?.availableDisplayModes?.includes("fullscreen"));
}

export async function openFullscreen(): Promise<boolean> {
  if (!canOpenFullscreen(bridge.getHostContext())) return false;
  try {
    const result = await bridge.requestDisplayMode({ mode: "fullscreen" });
    if (result?.mode !== "fullscreen") return false;
    // Record the granted mode now; a later host context update still wins.
    update({ context: { ...state.context, displayMode: "fullscreen" } });
    return true;
  } catch {
    return false;
  }
}

export function readResult(result: ToolResult) {
  if (result.isError)
    throw new Error(
      result.content?.find((item) => item.type === "text")?.text ??
        "Phaseo could not load this data.",
    );
  if (!result.structuredContent || typeof result.structuredContent !== "object")
    throw new Error("Phaseo returned an incomplete result. Try again.");
  return result.structuredContent as Record<string, unknown>;
}
