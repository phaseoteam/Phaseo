export interface WorkspaceSpendSettingsUpdate {
  billing_time_zone?: string;
  department_attribution?: "all" | "primary";
  report_cadence?: "off" | "daily" | "weekly" | "monthly";
  report_include_admins?: boolean;
}
