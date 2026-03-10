export interface InvalidRequestResponse {
  error: string;
  max_offset?: number;
  message: string;
  ok: false;
  [key: string]: unknown;
}
