# Accessibility

We want everyone to be able to use Phaseo, including people who use screen readers, keyboard navigation, magnification, voice control, or other assistive technology. This document describes where we are today, the gaps we know about, and how to tell us when something gets in your way.

## What this covers

This statement covers the software built from this repository:

- The web app at [phaseo.app](https://phaseo.app), including the model catalogue, dashboard, and Chat
- The documentation at [phaseo.app/docs](https://phaseo.app/docs)
- The desktop app (`apps/desktop`) and mobile app (`apps/mobile`)
- The `phaseo` CLI and the SDKs, including their terminal output and error messages

The gateway API has no user interface of its own, but its error messages and documentation are in scope.

## Our goal

We aim to meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA across the web app and documentation, and the equivalent platform guidelines in the desktop and mobile apps.

We have not yet carried out a formal accessibility audit, so we do not claim conformance with WCAG or any other standard today.

## What we do today

- Interactive controls in the web app are built on [Base UI](https://base-ui.com) primitives, which provide keyboard support, focus management, and ARIA semantics for menus, dialogs, popovers, and similar components.
- Many animations respect the `prefers-reduced-motion` setting.
- The web app has both light and dark themes.

## Known barriers

We are honest about what we have not done yet:

- **No automated accessibility checks.** Accessibility is not tested in CI, so regressions can ship unnoticed.
- **No assistive technology testing.** We have not systematically tested with screen readers (such as NVDA, JAWS, VoiceOver, or TalkBack) or with voice control.
- **Data-heavy pages.** Charts, large comparison tables, and pricing tables may not yet have complete text alternatives or table semantics.
- **Streaming output.** Responses that stream into Chat may not be announced well by screen readers.
- **Reduced motion.** Not every animation honours `prefers-reduced-motion` yet.

If you hit one of these, or anything else, please report it. Reports from real use help us decide what to fix first.

## Supported environments

We aim to support:

- Current versions of Chrome, Edge, Firefox, and Safari on desktop
- Safari on iOS and Chrome on Android
- The built-in screen readers and accessibility settings of Windows, macOS, iOS, and Android

## Reporting a barrier

If something in Phaseo is hard or impossible to use, tell us in whichever way suits you:

1. **GitHub:** open a [bug report](https://github.com/phaseoteam/Phaseo/issues/new?template=bug.yml) and start the title with `Accessibility:`.
2. **Email:** write to `support@phaseo.app` with `Accessibility:` at the start of the subject. Use this if you would rather not post publicly, or if GitHub itself is hard for you to use.

It helps to include:

- The page, screen, or command where you hit the problem
- What you were trying to do and what happened instead
- Your browser or app, operating system, and any assistive technology you use, with versions if you know them

You do not need to know which guideline is involved, or how to fix it. A plain description is enough.

We aim to acknowledge reports within 5 business days. We treat barriers that block a task completely, such as being unable to sign in, pay, or send a request, as high priority bugs.

## Contributing

Accessibility is part of the quality bar for changes to this repository, alongside the rest of [CONTRIBUTING.md](CONTRIBUTING.md). When you change user interface code:

- Use the shared components in `apps/web/src/components` and `apps/web/src/components/ui` rather than rebuilding controls from plain elements.
- Make sure everything works with a keyboard alone, with a visible focus indicator.
- Give images, icons that carry meaning, and icon-only buttons an accessible name.
- Do not rely on colour alone to convey information, and check contrast in both light and dark themes.
- Respect `prefers-reduced-motion` for any new animation.
- If you know your change leaves a gap, say so in the pull request rather than leaving it for users to find.

## Ownership and maintenance

The Phaseo maintainers own this statement and the accessibility of the products it covers. We review it whenever we close a known barrier or add testing, and at least once a year.

Last reviewed: November 2026.
