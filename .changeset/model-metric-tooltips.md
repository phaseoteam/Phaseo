---
"@phaseo/web": patch
"@phaseo/mobile": patch
---

Model uptime headline figures (Reachable, Accepted and Completed) are now the true share of all provider attempts in the last 24 hours, not an average of 24 hourly rates. The average counted idle hours as 100%, so a model could read "Completed 96.7%" while two in three of its accepted attempts failed. The failure share in each explanation comes from the same rates, so the figure and its explanation always agree. With no attempts in 24 hours, every step reads 100% with "No failures". The chart lines still show hours without data at 100%. The mobile app matches.

Metric explanations on model pages open on tap and click as well as hover, and from the keyboard. This covers the three uptime labels and the Performance charts' help icons. The provider table's daily uptime bars now show their day and rate on hover, focus or tap, and a day with no traffic says so instead of "--".

The explanations are more precise. Reachable now lists 502, 504, Cloudflare 520–527 and 503s without an overload signal, matching how the gateway classifies attempts. Accepted lists 429s on Phaseo's own key, 529s and overloaded responses. The failure lines are shorter, for example "66.7% failed after the provider accepted them". The Uptime column header explains what the 3-day uptime measures. Throughput, Latency and E2E latency now use the documented definitions: effective throughput, time to first token and full request time.
