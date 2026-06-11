/**
 * Gateway-managed apply-patch server tool for the Responses API. The gateway validates patch operations and returns them to the client; it does not mutate files.
 *
 */
export interface GatewayApplyPatchToolDefinition {
  type: "ai-stats:apply_patch";
}
