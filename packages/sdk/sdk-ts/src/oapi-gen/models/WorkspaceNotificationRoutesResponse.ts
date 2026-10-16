export interface WorkspaceNotificationRoutesResponse {
  data: {
    auto_top_up_failed: string[];
    low_balance: string[];
    model_deprecation: string[];
    payment_method_expiring: string[];
    rate_limit_throttled: string[];
  };
}
