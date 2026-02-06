export interface ModelPricing {
  meters?: {
    cached_read_text_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    cached_write_text_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_audio_seconds?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_audio_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_image?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_image_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_text_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    input_video_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    output_audio_seconds?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    output_audio_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    output_image?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    output_image_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    output_text_tokens?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
    web_search?: {
      currency?: string | null;
      price_per_unit?: string;
      provider_id?: string;
      unit?: string;
      unit_size?: number;
    } | null;
  };
  pricing_plan?: string;
}
