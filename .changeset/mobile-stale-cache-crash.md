---
"@phaseo/mobile": patch
---

Fixes the mobile app crashing on the home screen after updating from a build that saved its model releases in an older format. Saved data from older builds is now discarded on update, and the home screen no longer assumes the upcoming-releases list exists.
