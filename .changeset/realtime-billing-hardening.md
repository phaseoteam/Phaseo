---
"@phaseo/gateway-api": patch
---

Harden realtime voice billing. Microphone audio the provider never committed is no longer treated as pending billing, a disconnect discards the uncommitted buffer and cancels any reply in progress instead of creating a new one, and budget limits no longer send an extra closing reply. A turn whose provider usage never arrives is settled from confirmed usage plus an estimate from metered audio rather than held for manual review. xAI server VAD sessions are billed for connected time (or the cost xAI reports), usage is journaled before events reach the client, failed review items no longer stop the queue, healthy sessions are skipped by reconciliation, and unclaimed sessions are released after two minutes.
