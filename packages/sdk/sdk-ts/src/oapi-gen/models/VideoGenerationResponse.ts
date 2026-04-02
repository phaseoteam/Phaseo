export interface VideoGenerationResponse {
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    [key: string]: unknown;
  };
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  model?: string;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  seconds?: number;
  size?: string;
  started_at?: number | string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
}
