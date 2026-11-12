---
"@phaseo/web": minor
---

Redesign the compare page around one grouped table: headline prices on the routes Phaseo serves, the best value marked in each row, a differences-only switch and a short "choose this model for" summary. It adds a pricing section with service tiers and per-unit prices, a cost calculator that runs in the browser, a providers table per model, and benchmarks compared at matching effort levels with confidence intervals. Phones show two models at a time with labels above the values. The picker searches by words and shows the lab, modalities, release date and whether Phaseo serves each model. The page now reads the compact `/api/_web/compare/view` payload and removes about 8,000 lines of old compare components.
