export interface MyJoinRequest {
  created_at?: string;
  decided_at?: string | null;
  id?: string;
  status?: "pending" | "approved" | "rejected";
  workspace_id?: string;
  workspace_name?: string | null;
}
