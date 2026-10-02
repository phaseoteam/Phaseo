# Maintaining web translations

Regular interface copy belongs in the message catalogs for all nine web locales.
Keep brands, model/provider IDs, API field names, code examples, and user-authored
content in their original form. Translate system-generated descriptions and
known status or error labels at their display boundary; preserve their stored
codes.

## Check changes

From the repository root:

```sh
pnpm --filter @phaseo/web validate:i18n
pnpm --filter @phaseo/web audit:i18n:ui
pnpm --filter @phaseo/web test:i18n:ui-audit
```

The UI audit exits unsuccessfully when it finds unreviewed literal copy. It uses
the TypeScript compiler's configured module resolution to follow imports and
re-exports from locale routes and root error/document surfaces, including literal
dynamic imports. It checks JSX text, common label/help/accessibility attributes,
conditional literal branches rendered in JSX, and literal toast/error-setter
messages in reachable TSX files. `--json` returns locations and review counts.

Translate findings before adding an exception. The exact strings in
`scripts/localised-ui-exceptions.json` are reviewed brands, code examples, or
technical values. Each group needs a reason; scope it to files, kinds, and
attributes where appropriate. Do not add a snapshot of all existing findings or
allow a whole component. A brand exception matches its complete spelling, so
ordinary prose containing the brand still fails.

The audit also recognizes text inside code/pre/style elements, URL-only input
examples, and specific translated fallback components. `SettingsPageHeader`
and footer fallback props are accepted only when their paired key exists in all
nine catalogs. The known `SensitiveValue` labels use its translated label map.
The optional FAQ factory's English fallback branches are accepted only when
their translation key exists in every catalog; the public page supplies its
translator and the FAQ tests cover each locale. Accessibility attributes inside
code elements are still checked.

The regression fixtures are in memory: they prove that new headings, inputs,
conditional labels, toast errors, missing fallback keys, and prose containing a
brand are rejected without modifying application files.

## Review what static checks cannot prove

This is a regression guard, not a claim that every rendered string is translated.
It does not inspect interpolated template text, computed/helper strings,
nonliteral dynamic imports, backend error messages, runtime data, or all metadata.
Review those at the display boundary and exercise changed screens in every
locale. Check dates, plural forms, number/currency formatting, and RTL layouts.
Raw backend exception messages should use a translated fallback unless the
message was deliberately localized. Authored descriptions and diagnostic code
values are intentionally preserved.

After merging remote main, rerun both catalog validation and this audit, review
new routes and imported components, and update all locale values for changed
regular text. Review dynamic copy as well as the reported literals. Docs have a
separate workflow in `apps/docs/TRANSLATION_WORKFLOW.md`; this command does not
validate MDX or OpenAPI translations.
