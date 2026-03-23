export interface ModelLifecycle {
  deprecation_date?: string | null;
  message?: string | null;
  replacement_model_id?: string | null;
  retirement_date?: string | null;
  status?: "active" | "deprecated" | "retired" | null;
}
