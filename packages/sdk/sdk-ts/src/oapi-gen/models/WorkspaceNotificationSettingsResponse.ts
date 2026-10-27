export interface WorkspaceNotificationSettingsResponse {
  data: {
    auto_top_up: {
      amount_nanos: number;
      balance_threshold_nanos: number;
      enabled: boolean;
      payment_method_id: string | null;
    };
    email_preferences: {
      auto_top_up_failure: boolean;
      model_deprecation: boolean;
      payment_method_expiring: boolean;
    };
    low_balance_email: {
      enabled: boolean;
      threshold_usd: number;
    };
    spend: {
      billing_time_zone: string;
      department_attribution: "all" | "primary";
    };
  };
}
