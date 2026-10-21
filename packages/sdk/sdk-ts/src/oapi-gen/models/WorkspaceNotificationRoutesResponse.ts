export interface WorkspaceNotificationRoutesResponse {
  data: {
    auto_top_up_failed: string[];
    low_balance: string[];
    model_deprecation: string[];
    model_substitution: string[];
    payment_method_expiring: string[];
    rate_limit_throttled: string[];
    spend_alert: string[];
    spend_blocked: string[];
    spend_report: string[];
  };
}
