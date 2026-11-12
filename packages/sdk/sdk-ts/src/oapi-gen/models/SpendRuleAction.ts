/**
 * notify, or notify and then block once spend reaches block_at_percent of the base or block_at_amount. Blocking is best effort and acts minutes after the threshold. While blocking is switched off for the gateway, a rule that would start blocking is refused with a 400, and a rule that already blocks only notifies.
 */
export type SpendRuleAction = "notify" | "block";
