export interface WorkspaceNotificationRoute {
  destination_ids: string[];
  event_kind:
    | "low_balance"
    | "auto_top_up_failed"
    | "payment_method_expiring"
    | "model_deprecation"
    | "rate_limit_throttled";
}
