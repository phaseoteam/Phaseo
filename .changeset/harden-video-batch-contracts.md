---
"@phaseo/gateway-api": patch
"@phaseo/sdk": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Harden asynchronous video settlement and terminal webhook recovery, preserve batch pricing conditions, and add scoped video provider options and explicit frame inputs. Align AtlasCloud Seedance mappings and expose LTX status and content recovery.

Journal video submissions across adapters, retain holds on uncertain outcomes, validate and enable MiniMax H3 Max after native lifecycle checks, and flag unexpected zero-cost completion of paid jobs. Persist webhook attempts before releasing delivery claims and expose provider submission state in job logs.

Correct MiniMax V1 resolution validation and Google REST video requests, isolate provider identity during content retrieval, recheck webhook state after claiming delivery, and preserve terminal completion timestamps on repeated reads.
