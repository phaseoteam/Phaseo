---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Improve mobile catalog navigation, attention filters, persistent save controls, and failed-save reporting. Preserve all catalog records in midnight UTC exports, including rows without update timestamps.

Match catalog searches by display name and ID regardless of punctuation. Replace native editor controls with shared ShadCN components and simplify pricing into provider price groups with focused editing panels, guided charge selection, billing-unit conversion, and discardable drafts.

Make long catalog dropdowns searchable and replace the provider grid and expanded forms with compact connected-route rows and a tabbed editor.

Replace categorical text inputs with searchable choices. Preserve saved prices as dated versions, end-date catalogue relationships, and record baseline plus append-only row history across all catalogue tables. Keep ended records out of current public results and expose recent model changes in the internal editor.

Create and edit regional offers from Providers, with parent families, region labels, residency settings and separate API endpoints. Show labelled offers in model selectors and preserve existing gateway routing flags.

Warn before leaving unfinished catalog edits, including browser history navigation. Restore admin model notice saves with validation and complete history, reject malformed clear requests, and distinguish cache refresh failures from successful saves.

Manage stealth provider routes from the catalog editor, with anonymous route IDs, preserved pricing history, and explicit public identity controls.
