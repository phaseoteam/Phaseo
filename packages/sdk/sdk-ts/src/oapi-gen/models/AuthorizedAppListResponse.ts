export interface AuthorizedAppListResponse {
  data: {
    app_name?: string;
    authorized_at?: string;
    client_id?: string;
    current?: boolean;
    id?: string;
    last_used_at?: string | null;
    scopes?: string[];
    workspace_id?: string;
    workspace_name?: string | null;
  }[];
}
