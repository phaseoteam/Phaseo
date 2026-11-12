export interface WorkspaceNotificationRoute {
  destination_ids: string[];
  event_kind:
    | "low_balance"
    | "auto_top_up_failed"
    | "payment_method_expiring"
    | "model_deprecation"
    | "model_substitution"
    | "rate_limit_throttled"
    | "broadcast_destination_failing"
    | "spend_alert"
    | "spend_blocked"
    | "spend_report";
}
