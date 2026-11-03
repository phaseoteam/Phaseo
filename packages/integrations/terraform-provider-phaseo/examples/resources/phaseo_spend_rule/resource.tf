resource "phaseo_spend_rule" "monthly_budget" {
  name               = "Monthly budget"
  metric             = "budget_percent"
  period             = "month"
  base_kind          = "workspace_budget"
  base_ref           = "monthly"
  threshold_percents = [50, 80, 100]
  action             = "block"
  block_at_percent   = 110
}
