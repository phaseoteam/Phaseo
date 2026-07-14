export interface BatchProviderCapability {
  documentation_url?: string;
  gateway_input_modes?: "file" | "requests"[];
  id?: string;
  name?: string;
  native_input_modes?: "file" | "requests"[];
  notes?: string | null;
  status?: "active" | "planned";
}
