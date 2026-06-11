/**
 * Gateway-managed Advisor server tool. The gateway calls the configured advisor model and injects the advice back into the model tool loop.
 *
 */
export interface GatewayAdvisorToolDefinition {
  forward_transcript?: boolean;
  instructions?: string;
  max_completion_tokens?: number;
  max_tokens?: number;
  max_uses?: number;
  model?: string;
  name?: string;
  parameters?: {
    forward_transcript?: boolean;
    instructions?: string;
    max_completion_tokens?: number;
    max_tokens?: number;
    max_uses?: number;
    model?: string;
    name?: string;
    reasoning?: {
      [key: string]: unknown;
    };
    temperature?: number;
  };
  reasoning?: {
    [key: string]: unknown;
  };
  temperature?: number;
  type: "ai-stats:advisor";
}
