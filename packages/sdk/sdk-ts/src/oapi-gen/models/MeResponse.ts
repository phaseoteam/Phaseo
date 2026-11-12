export interface MeResponse {
  data: {
    current_workspace_id?: string;
    oauth?: {
      client_id?: string;
      resource?: string | null;
      scopes?: string[];
    };
    user?: {
      email?: string | null;
      id?: string;
      name?: string | null;
    };
    workspaces?: {
      current?: boolean;
      id?: string;
      name?: string | null;
      role?: string | null;
      slug?: string | null;
    }[];
  };
}
