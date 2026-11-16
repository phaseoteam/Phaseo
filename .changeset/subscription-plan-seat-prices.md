---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Show seat prices correctly in the subscription plan comparison table: "$25 / Seat / month" for seat-priced plans, and "$80 + $40 / Seat / month" when a plan charges per account and per seat, instead of one seat's total as the plan price. Stop showing "Rate limit: {}" for models without a rate limit.
