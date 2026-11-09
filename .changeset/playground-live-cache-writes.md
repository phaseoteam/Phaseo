---
"@phaseo/web": patch
---

The GPT Live usage panel in the playground shows backend cache writes again. Since cache writes were split into 30-minute and 12-hour meters it showed 0; it now adds both lifetimes together.
