---
"@phaseo/web": patch
---

Add an admin-only Stripe sandbox test checkout on the credits page. It opens a $10 sandbox checkout (test cards only) that tops up a dedicated "Stripe sandbox" workspace through a separate sandbox webhook, so the full payment flow can be tested without real money. The live webhook now ignores test-mode events.
