/**
 * Gateway-managed server tool. The gateway executes the datetime lookup and injects the result back into the model tool loop.
 *
 */
export interface GatewayDatetimeToolDefinition {
  parameters?: {
    timezone?: string;
  };
  timezone?: string;
  type: "gateway:datetime";
}
