---
"@phaseo/web": patch
---

Fix the lifecycle alerts page crashing when a workspace has deprecation warnings, and centre the model deprecation banner with its dismiss button pinned to the right edge. The alerts page drops the time range and refresh controls, which had no effect on its data, and its "Show more" sections use a chevron instead of the browser's disclosure triangle.
