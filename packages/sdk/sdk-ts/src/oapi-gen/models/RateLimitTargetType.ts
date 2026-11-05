/**
 * What a policy applies to. A department policy is one allowance shared by its members and linked keys. end_user_default applies to each end user identified on a request.
 */
export type RateLimitTargetType =
  "key" | "member" | "department" | "end_user_default";
