export interface ListFilesResponse {
  data?: {
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }[];
  object?: string;
}
