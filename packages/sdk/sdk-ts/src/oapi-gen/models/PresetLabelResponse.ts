export interface PresetLabelResponse {
  data: {
    created_at?: string | null;
    label: string;
    updated_at?: string | null;
    updated_by?: string | null;
    version_id: string;
    version_label: string | null;
    version_number: number | null;
  };
}
