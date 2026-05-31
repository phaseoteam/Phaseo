export interface BatchProviderCapability {
  documentation_url?: string;
  gateway_input_modes?: "file" | "inline"[];
  id?: string;
  name?: string;
  native_input_modes?: "file" | "inline"[];
  notes?: string | null;
  status?: "active" | "planned";
}
