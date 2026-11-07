export interface WorkspaceMemberAddResponse {
  added_count: number;
  approved: string[];
  data?: {
    display_name?: string | null;
    joined_at?: string | null;
    role: "owner" | "admin" | "member";
    user_id: string;
    workspace_id: string;
  }[];
  error?: string;
  failed: {
    code: "forbidden" | "conflict" | "internal_error";
    message: string;
    user_id: string;
  }[];
  message?: string;
  not_attempted: string[];
}
