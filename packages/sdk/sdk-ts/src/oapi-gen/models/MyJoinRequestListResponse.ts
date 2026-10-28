export interface MyJoinRequestListResponse {
  data: {
    created_at?: string;
    decided_at?: string | null;
    id?: string;
    status?: "pending" | "approved" | "denied" | "cancelled";
    workspace_id?: string;
    workspace_name?: string | null;
  }[];
}
