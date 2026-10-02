import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { modelExplorerHtml } from "./generated/modelExplorerHtml";

export const MODEL_EXPLORER_URI = "ui://phaseo/model-explorer.html";

export const modelExplorerToolMeta = {
  ui: { resourceUri: MODEL_EXPLORER_URI, visibility: ["model", "app"] },
  "openai/ui": { entrypoints: [{ type: "thread" }] },
};

export function registerModelExplorer(server: McpServer) {
  const metadata = {
    ui: {
      csp: { connectDomains: [], resourceDomains: [] },
      prefersBorder: false,
    },
    "openai/ui": {
      availableDisplayModes: ["fullscreen"],
      preferredDisplayMode: "fullscreen",
    },
  };
  registerAppResource(
    server,
    "Phaseo model explorer",
    MODEL_EXPLORER_URI,
    { _meta: metadata },
    async () => ({
      contents: [
        {
          uri: MODEL_EXPLORER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: modelExplorerHtml,
          _meta: metadata,
        },
      ],
    }),
  );
}
