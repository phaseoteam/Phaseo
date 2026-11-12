export interface ImagesGenerationResponse {
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
  svg_usage?: {
    input_tokens?: number;
    model?: string;
    output_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
}
