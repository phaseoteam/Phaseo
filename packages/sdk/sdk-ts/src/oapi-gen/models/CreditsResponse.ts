export interface CreditsResponse {
  credits: {
    available_nanos: number;
    balance_nanos: number;
    remaining: number;
    reserved_nanos: number;
    thirty_day_requests: number;
    thirty_day_usage: number | null;
  };
  ok: true;
}
