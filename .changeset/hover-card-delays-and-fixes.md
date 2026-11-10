---
"@phaseo/web": patch
---

Hover cards now open after the delay each one asks for (150 ms by default) instead of Base UI's 600 ms, open above their trigger with a smaller radius, and no longer trigger the surrounding row when tapped on a touch screen. The provider attempt card in request details shows the Phaseo model ID instead of the upstream one, provider source links are labelled by what they document, the provider pricing note shows the note as published, benchmark hover cards format cost scores in dollars, and the monitor's Status column sorts without also opening its legend on tap. Removes unused tier badge, API model card, parameter popover, context and inline citation components.
