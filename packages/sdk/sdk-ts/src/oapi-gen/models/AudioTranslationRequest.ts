export interface AudioTranslationRequest {
  audio_b64?: string;
  audio_url?: string;
  language?: string;
  model: string;
  prompt?: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  temperature?: number;
}
