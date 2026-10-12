export interface RateLimitAssignmentInput {
  policy_id: string;
  target_id?: string;
  target_type:
    "key" | "member" | "department" | "guardrail" | "end_user_default";
}
