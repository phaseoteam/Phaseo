/**
 * notify, or notify and then block once spend reaches block_at_percent of the base or block_at_amount. Blocking is best effort and acts minutes after the threshold. Blocking is not available yet: a rule with action block is refused with a 400 until it is.
 */
export type SpendRuleAction = "notify" | "block";
