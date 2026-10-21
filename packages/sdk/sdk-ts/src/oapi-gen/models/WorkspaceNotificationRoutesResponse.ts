export interface WorkspaceNotificationRoutesResponse {
  data: {
    auto_top_up_failed: string[];
    broadcast_destination_failing: string[];
    low_balance: string[];
    model_deprecation: string[];
    model_substitution: string[];
    payment_method_expiring: string[];
    rate_limit_throttled: string[];
  };
}
