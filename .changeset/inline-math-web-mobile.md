---
"@phaseo/app-kit": patch
"@phaseo/mobile": patch
"@phaseo/web": patch
---

Enable native inline and display math in mobile chat using the existing Markdown engine, with themed equations, model formatting guidance and intact streaming equation blocks. Share web/mobile currency and code normalization, including unfinished code fences.

Compile Android SQLite from source to match the app's Expo Modules runtime after the native startup check exposed an incompatible prebuilt binary.

Preserve Android's reflected display-math view during release shrinking and use Markdown escapes for currency because the native parser drops HTML entity text.
