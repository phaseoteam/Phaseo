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

We have not had an independent accessibility audit, so we do not claim conformance with WCAG or any other standard.

## What we do today

- Interactive controls in the web app are built on [Base UI](https://base-ui.com) primitives, which provide keyboard support, focus management, and ARIA semantics for menus, dialogs, popovers, and similar components.
- Every page in the web app has a "Skip to content" link and a single main content area. The documentation has its own skip link.
- Animations follow the operating system's reduced motion setting.
- The web app's lint checks component code for common accessibility mistakes, such as images without alt text, invalid ARIA attributes, unlabelled form fields, or click handlers that cannot be reached from the keyboard. A mistake fails the pull request.
- The web app has light and dark themes, and we check text contrast in both.
- Every night, an automated check (axe-core, against WCAG 2.2 AA) scans a set of public pages on the live site at phaseo.app in both themes, including colour contrast. Serious and critical problems fail the check, so we see them the next morning. The pages and the few known exceptions, each with its reason, are listed in `scripts/a11y/live-scan.config.json`.

## Our November 2026 review

In November 2026 we reviewed 54 page types in the web app and documentation against WCAG 2.2 AA. We used automated checks (axe-core) in light and dark themes, a keyboard walk through each page, and a check at 320 pixels wide. We fixed what it found:

- Low-contrast secondary text, status labels, and tags, in both themes
- Expandable sections, such as filters and FAQs, that did not show keyboard focus
- A cookie banner that could cover links receiving keyboard focus
- The missing "Skip to content" link, and pages with more than one main area
- Sidebar lists that were not structured as lists, and controls with no accessible name (some dropdowns, switches, action buttons, and progress bars)
- Table rows that acted as buttons while containing other links and buttons
- Buttons and links smaller than 24 by 24 pixels
- Pages that scrolled sideways at 320 pixels wide
- Garbled characters in some benchmark names

## Known gaps

Automated checks find only part of what affects real users. We have not yet:

- Tested systematically with screen readers (such as NVDA, JAWS, VoiceOver, or TalkBack) or with voice control. In particular, responses that stream into Chat may not be announced well.
- Reviewed menus, dialogs, and forms in their opened and error states.
- Reviewed the desktop and mobile apps.
- Provided captions or transcripts for audio and video that models generate in Chat and the model playground, or that people attach in Chat. The prompt, and any text reply, is shown next to the player, but it doesn't describe what you hear.
- Checked whole pages before they ship. The nightly scan only covers public pages, after changes are live, and only finds what automated checks can detect. Pages behind sign-in, such as Chat, settings and the dashboard, are not scanned automatically at all.

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
