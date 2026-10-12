/**
 * What a policy applies to. A department policy is one allowance shared by its members and linked keys. A guardrail policy gives each key and member the guardrail covers its own allowance. end_user_default applies to each end user identified on a request.
 */
export type RateLimitTargetType =
  "key" | "member" | "department" | "guardrail" | "end_user_default";
