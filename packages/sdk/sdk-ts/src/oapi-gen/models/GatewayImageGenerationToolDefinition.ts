/**
 * Gateway-managed server tool. The gateway generates an image through the normal image generation endpoint and returns generated image data to the model tool loop.
 *
 */
export interface GatewayImageGenerationToolDefinition {
  model?: string;
  parameters?: {
    background?: string;
    model?: string;
    n?: number;
    output_format?: string;
    quality?: string;
    response_format?: string;
    size?: string;
  };
  type: "gateway:image_generation";
}
