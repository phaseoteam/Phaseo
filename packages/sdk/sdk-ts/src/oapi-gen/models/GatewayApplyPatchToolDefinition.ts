/**
 * Gateway-managed server tool. The gateway validates a proposed Codex-style apply_patch block and returns it as an artifact without applying files on the server.
 *
 */
export interface GatewayApplyPatchToolDefinition {
  parameters?: {};
  type: "gateway:apply_patch";
}
