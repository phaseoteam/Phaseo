---
"@phaseo/web-api": patch
---

The compare view and selection read subscription plans for the selected models only, instead of the whole 1 MB catalogue on every request. Model benchmark and timeline sections stay cached for 6 hours (then up to 18 hours stale while refreshing) instead of 1 hour, since their edits purge these caches.
