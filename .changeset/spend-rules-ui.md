---
"@phaseo/web": minor
"@phaseo/web-api": patch
---

Add a Spend alerts section to Settings → Notifications. It lists the workspace's spend rules with their scope, type, period, thresholds, current value ("42% · $42.10 of $100.00"), last alert and an on/off switch, and marks types that are saved but not evaluated yet. An editor sheet covers scope (workspace, key, member, department, model or provider), alert type, amount or percentage with a base (an amount, the workspace budget, the key's cost limit or the previous period), period, rolling window and time zone, 50/80/100% threshold chips, notify or notify-then-block with a grace margin (blocking turns on in a later release), spike, balance and forecast fields, per-rule destinations, a preview line and a test send. Each rule has a history drawer. The same section sets the workspace billing time zone and department spend attribution. A key's page offers "Alert me at 80% of this key's limit" under each window with a cost limit. Owners and admins edit; other members see everything read-only. The settings API gains `GET /api/account/settings/spend-rules/options` for the editor's pickers.
