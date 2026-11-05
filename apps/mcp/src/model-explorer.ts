import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { modelExplorerHtml } from "./generated/modelExplorerHtml";
import type { PhaseoEnv } from "./phaseo-api";

export const MODEL_EXPLORER_URI = "ui://phaseo/model-explorer.html";

// Tools whose results render as an inline card in the conversation. The card can
// open the full explorer on request; it never opens it by itself.
export const modelCardToolMeta = {
  ui: { resourceUri: MODEL_EXPLORER_URI, visibility: ["model", "app"] },
};

// models_list also backs the explorer's sidebar and thread entry points.
export const modelExplorerToolMeta = {
  ...modelCardToolMeta,
  "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
};

export function registerModelExplorer(server: McpServer, env: Pick<PhaseoEnv, "PHASEO_WEB_BASE_URL">) {
  const webOrigin = new URL(env.PHASEO_WEB_BASE_URL).origin;
  const metadata = {
    ui: {
      // Organisation logos load from the website's static logo set.
      csp: { connectDomains: [], resourceDomains: [webOrigin] },
      prefersBorder: false,
    },
    // ChatGPT still applies its legacy CSP key to widget images; without it the
    // logos are blocked (seen in ChatGPT on 2026-11-04).
    "openai/widgetCSP": { connect_domains: [], resource_domains: [webOrigin] },
    "openai/ui": {
      // With both modes available ChatGPT defaults to fullscreen unless told otherwise.
      availableDisplayModes: ["inline", "fullscreen"],
      preferredDisplayMode: "inline",
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
