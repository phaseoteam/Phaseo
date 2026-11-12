---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Show every capability in the models table as a labelled badge with its icon, collapse endpoint aliases into one capability, and show one gateway status icon per status. The table projection now reports unlisted token prices as null and carries per-unit charges (per image, per second, per request, ...), so image, video and other non-token models show "From $X / unit" or "-" instead of a misleading $0.00, while listed $0 rates and free offers keep $0.
