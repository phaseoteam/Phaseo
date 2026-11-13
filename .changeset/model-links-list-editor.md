---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/mobile": patch
---

Model links are now a list: each link has a URL, the title people see, a kind from a fixed list and a display order. The model editor and the new-model form edit the list directly (paste a URL and the kind and title are filled in), the model page shows links in their saved order with each URL once, and the editor now loads a model's existing links instead of starting empty.
