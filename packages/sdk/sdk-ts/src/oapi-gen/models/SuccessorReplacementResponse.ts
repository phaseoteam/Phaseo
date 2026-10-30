export interface SuccessorReplacementResponse {
  data: {
    model?: string;
    successor?: string | null;
    updated_at?: string | null;
  };
}
