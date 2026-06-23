/**
 * Mistral-specific OCR options.
 */
export interface MistralOcrOptions {
  bbox_annotation_format?:
    | string
    | {
        [key: string]: unknown;
      }
    | null;
  confidence_scores_granularity?: "word" | "page" | null;
  document_annotation_format?:
    | string
    | {
        [key: string]: unknown;
      }
    | null;
  document_annotation_prompt?: string | null;
  extract_footer?: boolean;
  extract_header?: boolean;
  image_limit?: number | null;
  image_min_size?: number | null;
  include_blocks?: boolean;
  include_image_base64?: boolean | null;
  pages?: string | number[] | null;
  table_format?: "markdown" | "html";
  [key: string]: unknown;
}
