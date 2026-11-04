---
"@phaseo/web": minor
"@phaseo/web-api": patch
"@phaseo/gateway-api": patch
---

Add a Decisions rankings page at /rankings/decisions. Decision requests now record a `decision_tokens` workload meter; text rankings leave that volume out, and decision-only models no longer appear in the text page's Fastest Models or Unique Users sections.
