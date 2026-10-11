---
"@phaseo/web": patch
---

Fix model pages for rumoured models never finishing. Their status banner passed a Discord link callback for a plain `{discord}` placeholder, so the render errored and the response stayed open until the 300 second function limit. Every locale now uses a `<discord>` tag, and a test checks that each rich text tag callback has a matching tag in every locale.
