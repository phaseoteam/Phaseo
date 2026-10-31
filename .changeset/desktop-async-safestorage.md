---
"@phaseo/desktop": patch
---

Check secure credential storage with Electron's asynchronous safeStorage API, which replaces the synchronous one that Electron 46 removes, and report browser screenshot sizes in pixels on HiDPI displays once captures carry the page's scale factor. Saved credentials stay readable.
