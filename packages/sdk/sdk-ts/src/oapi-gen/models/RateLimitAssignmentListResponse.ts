export interface RateLimitAssignmentListResponse {
  data: {
    created_at: string;
    created_by?: string | null;
    id: string;
    policy_id: string;
    target_id: string | null;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
    updated_at: string;
    workspace_id: string;
  }[];
}
