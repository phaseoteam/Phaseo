/**
 * Gateway-managed image generation server tool. The gateway runs the configured image model and injects the image result back into the model tool loop.
 *
 */
export interface GatewayImageGenerationToolDefinition {
  aspect_ratio?: string;
  background?: string;
  description?: string;
  model?: string;
  moderation?: string;
  output_compression?: number;
  output_format?: string;
  parameters?: {
    aspect_ratio?: string;
    background?: string;
    description?: string;
    model?: string;
    moderation?: string;
    output_compression?: number;
    output_format?: string;
    prompt?: string;
    quality?: string;
    size?: string;
  };
  prompt?: string;
  quality?: string;
  size?: string;
  type: "ai-stats:image_generation";
}
