---
"@phaseo/web": patch
---

Make country pages lighter to render. The models section shows the newest six models per organisation, with a "Show all" button that loads the rest; searching loads the full list. The US page rendered all 859 model cards (about 12 MB of HTML) on every request.
