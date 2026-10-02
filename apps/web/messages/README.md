# Phaseo web message catalogs

`en-GB` is the source locale and catalog schema. Catalog keys are stable product
concepts; do not use English prose as keys.

The auth slice currently has a ten-locale Apple-compatible review cohort:

| Locale | Language | Catalog model | Status |
| --- | --- | --- | --- |
| `en-GB` | British English | Source | Public source |
| `en-US` | US English | Sparse `en-GB` overlay | Machine draft |
| `zh-Hans` | Simplified Chinese | Full catalog | Machine draft |
| `hi` | Hindi | Full catalog | Machine draft |
| `es-ES` | Spanish (Spain) | Full catalog | Machine draft |
| `fr-FR` | French (France) | Full catalog | Machine draft |
| `de-DE` | German | Full catalog | Machine draft |
| `pt-BR` | Brazilian Portuguese | Full catalog | Machine draft |
| `ja` | Japanese | Full catalog | Machine draft |
| `ar-SA` | Arabic | Full RTL catalog | Machine draft |

This is a product-priority cohort, not a claim that these are the ten most
spoken languages. It includes the requested German and US English coverage and
uses Apple App Store Connect's canonical locale tags. The longer-term breadth
benchmark is Apple's current 50-locale metadata matrix, recorded in
`src/i18n/apple-locales.ts`. Apple distinguishes store metadata from complete
product-UI localisation; Phaseo does too.

The current slice covers sign-in, sign-up, password reset, and authentication
errors. Other surfaces stay in English until they move as complete, tested
vertical slices.

## Preview drafts

An internal admin can open:

```text
/internal/localisation-preview
```

The preview renders the real auth components and catalogs, including the RTL
Arabic layout, inside a nested `lang` and `dir` boundary. Its auth controls are
read-only, it is excluded from indexing, and it does not make a locale public.
It uses the normal internal-admin session check, so a new worktree also needs
the web app's usual untracked Supabase and account-API environment variables.

## Validate changes

From the repository root:

```powershell
pnpm run validate:i18n
```

The validator checks:

- canonical, unique locale tags and registry/fallback invariants;
- exact key parity for full and resolved catalogs;
- sparse regional-overlay subsets and non-redundant overrides;
- ICU arguments, selectors, offsets, and locale-valid plural categories;
- real plural rendering under each target locale, including all Arabic forms;
- protected Phaseo, Gateway, SSO, code, URL, and email tokens;
- untranslated-coverage limits for full draft catalogs;
- deterministic `en-XA` pseudo-localisation.

`en-XA` is a CI/layout-testing tool, not a public locale or Weblate file.

Keep `Phaseo`, `Gateway`, provider and model names, API paths, identifiers,
code, email examples, and URLs unchanged unless the reviewed glossary
explicitly says otherwise.

Native review should settle product terms such as passkey, provider routing,
workspace, support, billing, and Enterprise SSO. It must also review regional
tone, German expansion, Chinese and Japanese typography, Hindi code-switching,
Latin-script password-policy wording, and Arabic grammar, bidi isolation, and
RTL layout.

## Full catalogs and regional overlays

Independent languages and scripts use a complete `auth.json`. Regional
variants inherit a reviewed same-language fallback and store only deliberate
differences in `auth.overrides.json`. For example, `en-US` inherits `en-GB` and
overrides only spelling that actually differs. The Weblate full-catalog mask
does not consume overlay files.

## Review and launch a locale

Draft catalogs are listed as staged in the locale registry, not in public
routing. Machine-generated copy is not approved production copy.

1. Review the complete catalog or resolved regional overlay in Weblate and Git
   against the approved glossary.
2. Assign an accountable native reviewer for the language and target region.
3. Keep it staged until the App Router, auth/MFA callbacks and return paths,
   fonts, metadata, canonicals, alternates, sitemap, root `lang`, and `dir` pass
   the launch gates in `docs/architecture/localisation.md`.
4. Mark the catalog approved and add it to public routing only in that launch
   change. The public loader remains exhaustive, so a locale cannot silently
   fall back to English.

The generated `*.d.json.ts` declaration is ignored. `next-intl` recreates it
from the English catalog during development and builds to type ICU arguments.
