export interface Model {
  aliases?: string[];
  deprecation_date?: string | null;
  endpoints?: string[];
  input_types?: string[];
  model_id?: string;
  name?: string | null;
  organisation_colour?: string | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
  output_types?: string[];
  pricing?: {
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
  };
  providers?: {
    api_provider_id?: string;
    params?: string[];
  }[];
  release_date?: string | null;
  retirement_date?: string | null;
  status?: string | null;
  supported_params?: string[];
  top_provider?: string | null;
}
