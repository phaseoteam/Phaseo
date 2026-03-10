export interface KeyInvalidateResponse {
  cache_version: {
    id: number;
    kid: number | null;
  };
  key: {
    id: string;
    kid?: string | null;
    status?: string | null;
    team_id: string;
  };
  message: string;
  ok: true;
}
