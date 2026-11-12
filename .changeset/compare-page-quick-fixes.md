---
"@phaseo/web": patch
---

Fix the compare page's headline prices and dropdowns. Input and output prices now come from standard-tier text-token rates, on routes Phaseo serves when there are any. They no longer pick up a provider's $0 image or reasoning rows, batch discounts, or other listings' discounted rows. The provider and service-tier dropdowns show display names ("Amazon Bedrock", "Standard") instead of raw ids, and a model without priced providers no longer shows "__none__". Four models fit on desktop without clipping the last column. The empty Subscription plans heading and the always-unknown Capabilities row are hidden, plan cards no longer overflow their column, and Performance "View charts" opens the model's performance section. Model page titles no longer say "Compare 1 Providers".
