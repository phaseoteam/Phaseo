---
"@phaseo/gateway-api": minor
---

Add spend report settings and the spend report email (queued only behind `SPEND_REPORTS_ENABLED`, which is off).

- `GET/PATCH /v1/control/notifications/settings` has two new fields in `spend`: `report_cadence` (`off`, `daily`, `weekly` or `monthly`; default `weekly`) and `report_include_admins` (default `false`).
- Reports go out at 09:00 in the workspace's `billing_time_zone`: daily for the day before, weekly on Monday for the previous Monday-to-Sunday week, and monthly on the 1st for the previous month. Periods without spend are skipped.
- Owners get the report by email. Admins get it when `report_include_admins` is on. Every email has a one-click unsubscribe link for that person and workspace. Destinations routed to `spend_report` get one summary per report.
- A report shows total spend, requests and tokens and the change from the period before; the top 5 keys, models, members and departments; this month's forecast and the balance runway; and the period's spend alerts and blocks.
