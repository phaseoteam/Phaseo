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

We have not yet had an independent accessibility audit, and our own review found barriers (listed below), so we do not claim conformance with WCAG or any other standard today.

## What we do today

- Interactive controls in the web app are built on [Base UI](https://base-ui.com) primitives, which provide keyboard support, focus management, and ARIA semantics for menus, dialogs, popovers, and similar components.
- Many animations respect the `prefers-reduced-motion` setting.
- The web app has both light and dark themes.

## Known barriers

In November 2026 we ran an automated and keyboard review of the web app against WCAG 2.2 AA. It found these barriers, which we are working through:

- **Colour contrast.** Some secondary text, status labels, and tags fall below the required contrast, in both light and dark themes.
- **Focus visibility.** Some expandable sections, such as filters and FAQs, do not show where keyboard focus is.
- **Cookie banner.** On a first visit, the cookie banner can cover links that receive keyboard focus.
- **No skip link.** The web app has no "Skip to content" link, so keyboard users must tab through the header on every page. The documentation has one.
- **Structure and labels.** Some sidebar navigation lists are not structured as lists, and a few controls (some dropdowns, a switch, and progress bars) have no accessible name.
- **Small targets.** Some small buttons and closely spaced links are below the 24 by 24 pixel minimum.
- **Narrow screens.** A few pages scroll sideways at 320 pixels wide.

We also have not yet:

- Run accessibility checks in CI, so regressions can ship unnoticed.
- Tested systematically with screen readers (such as NVDA, JAWS, VoiceOver, or TalkBack) or with voice control. In particular, responses that stream into Chat may not be announced well.
- Reviewed the desktop and mobile apps.
- Applied `prefers-reduced-motion` to every animation.

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
