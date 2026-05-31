/**
 * Gateway-managed server tool. The gateway searches the local AI Stats server-tool catalog and returns matching tool definitions.
 *
 */
export interface GatewayToolSearchToolDefinition {
  parameters?: {};
  type: "gateway:tool_search";
}
