export interface ObservabilityDestinationTestResponse {
  data: {
    error?: string | null;
    http_status?: number | null;
    ok?: boolean;
    status?: string;
  };
}
