export interface Model {
  aliases?: string[];
  endpoints?: string[];
  input_types?: string[];
  model_id?: string;
  name?: string;
  organisation_id?: string;
  output_types?: string[];
  providers?: {
    api_provider_id?: string;
    params?: string[];
  }[];
  release_date?: string;
  status?: string;
}
