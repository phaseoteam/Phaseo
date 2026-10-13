---
"@phaseo/web": patch
"@phaseo/docs": patch
---

Repair corrupted and mistranslated settings text in Arabic, Japanese, Portuguese, Spanish, Chinese and Hindi, and use one set of terms across the Hindi web app and docs. Spanish and German now address the reader informally throughout (tú, du), and Chinese uses 你, matching the docs. Provider catalog errors that fell back to a generic message now show their real reason. The OAuth app delete dialog and the management key notice read correctly in every language, and the C# Agent SDK quickstart uses the right namespace. `validate:i18n` now rejects HTML entities, Latin-script words that are not in the English source, Simplified Chinese characters in Japanese, and German Sie or Chinese 您.
