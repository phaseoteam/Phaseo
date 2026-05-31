/**
 * Gateway-managed server tool. The gateway runs a bounded multi-model analysis panel and returns structured synthesis context to the model tool loop.
 *
 */
export interface GatewayFusionToolDefinition {
  analysis_models?: string[];
  include_web?: boolean;
  model?: string;
  parameters?: {
    analysis_models?: string[];
    include_web?: boolean;
    model?: string;
  };
  type: "gateway:fusion";
}
