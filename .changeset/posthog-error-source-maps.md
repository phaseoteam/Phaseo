---
"@phaseo/web": patch
---

Upload production source maps to PostHog so error stacks resolve to the original file and line. The maps are deleted from the build output after upload and are never served. Builds without the upload credentials skip the step.
