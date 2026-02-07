export interface BatchRequest {
  completion_window?: string;
  endpoint: string;
  input_file_id: string;
  metadata?: {};
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
}
