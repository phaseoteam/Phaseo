export interface DataModel {
  deprecation_date?: string | null;
  hidden?: boolean;
  input_types?: string[];
  lifecycle?: {
    deprecation_date?: string | null;
    message?: string | null;
    replacement_model_id?: string | null;
    retirement_date?: string | null;
    status?: "active" | "deprecated" | "retired" | null;
  };
  model_id?: string | null;
  name?: string | null;
  organisation?: {
    colour?: string | null;
    country_code?: string | null;
    name?: string | null;
    organisation_id?: string | null;
  } | null;
  output_types?: string[];
  release_date?: string | null;
  retirement_date?: string | null;
  status?: string | null;
}
