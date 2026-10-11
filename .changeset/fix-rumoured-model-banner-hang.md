---
"@phaseo/web": patch
---

Fix model pages for rumoured models never finishing. Their status banner passed a Discord link callback for a plain `{discord}` placeholder, so the render errored and the response stayed open until the 300 second function limit. Every locale now uses a `<discord>` tag.

A new test checks that each rich text tag callback has a matching tag in every locale. It also found and fixed:

- the compare page licence sentence, which had lost both model names and their links;
- the free router ID, which had lost its monospace style;
- the Spanish terms, which had lost the operator's emphasis;
- an unused code callback in provider onboarding.
