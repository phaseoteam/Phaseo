/**
 * How often workspace owners get a spend report email, and admins too when report_include_admins is on: off, daily (09:00 for the day before), weekly (Monday 09:00 for the previous Monday-to-Sunday week) or monthly (the 1st at 09:00 for the previous month), in the billing time zone. Periods without spend are skipped. Workspace spend_report routes get one summary per report. Defaults to weekly.
 */
export type WorkspaceSpendReportCadence =
  "off" | "daily" | "weekly" | "monthly";
