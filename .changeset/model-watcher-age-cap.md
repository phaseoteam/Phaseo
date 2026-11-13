---
"@phaseo/gateway-api": patch
---

Stop the model watchers announcing old models as new. Public announcements now skip a model that was first seen and released more than 30 days ago (`PUBLIC_MODEL_ANNOUNCEMENT_MAX_AGE_DAYS`), and a run with more than 25 fresh announcements (`PUBLIC_MODEL_ANNOUNCEMENT_MAX_PER_RUN`) is recorded silently and listed in the private channel instead of being posted. The provider watcher no longer reports a newly listed model whose provider `created` date is more than 30 days old (`MODEL_DISCOVERY_ADDED_MAX_AGE_DAYS`), and posts one line for Mistral/Mistral EU and MiniMax/MiniMax Lightning, which list identical models.
