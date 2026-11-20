export interface LiveSessionStatus {
  billing?: {
    [key: string]: unknown;
  };
  ended?: {
    [key: string]: unknown;
  } | null;
  expires_at?: string | null;
  id?: string;
  model?: string;
  session_id?: string;
  standby?: boolean | null;
  status?: string;
  transport?: {
    type?: "websocket" | "webrtc";
  };
  warnings?: {
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}
