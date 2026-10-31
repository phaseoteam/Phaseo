# @phaseo/desktop

## 0.2.0

### Minor Changes

- [#3405](https://github.com/phaseoteam/Phaseo/pull/3405) [`c5d5eaa`](https://github.com/phaseoteam/Phaseo/commit/c5d5eaad33cbd330da63cead4b9c01af0e121046) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Triage a Phaseo bug to the command palette: an agent debugs the app from the exact source of the running build, fixes and proves the bug, and drafts an issue that you review and file yourself.

### Patch Changes

- [#2711](https://github.com/phaseoteam/Phaseo/pull/2711) [`2a84658`](https://github.com/phaseoteam/Phaseo/commit/2a84658993c7477296c1ac4461d59044d3c732dc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update vulnerable runtime and tooling dependencies to patched releases, including Hono, Electron, Jackson, Guzzle, and shared dependency overrides.

- [#3401](https://github.com/phaseoteam/Phaseo/pull/3401) [`f6fe72f`](https://github.com/phaseoteam/Phaseo/commit/f6fe72f6c80574a4736b6f2130bc98de55784840) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Check secure credential storage with Electron's asynchronous safeStorage API, which replaces the synchronous one that Electron 46 removes, and report browser screenshot sizes in pixels on HiDPI displays once captures carry the page's scale factor. Saved credentials stay readable.

- [#3365](https://github.com/phaseoteam/Phaseo/pull/3365) [`b9f9ee9`](https://github.com/phaseoteam/Phaseo/commit/b9f9ee943a8a0d7bae3098d3fe0eb38ca0f5ff76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update Electron to 42.11.18 for security fixes, including distrust of the compromised eMudhra intermediate certificates.

- [#3381](https://github.com/phaseoteam/Phaseo/pull/3381) [`797a8c1`](https://github.com/phaseoteam/Phaseo/commit/797a8c130ad64436fcf6fbb8818a1dfb43f3bd88) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update Electron to 45.0.0, a supported release line, and copy browser screenshots to the clipboard with Electron's new clipboard API.

- [#3396](https://github.com/phaseoteam/Phaseo/pull/3396) [`a9392d5`](https://github.com/phaseoteam/Phaseo/commit/a9392d5e5cf3aa657e72bf690956a229a8320e8a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update build dependencies with security fixes: vite 8.1.6, sharp 0.35.5, shell-quote, launch-editor, follow-redirects, tmp and basic-ftp.

- [#3394](https://github.com/phaseoteam/Phaseo/pull/3394) [`4729911`](https://github.com/phaseoteam/Phaseo/commit/47299110a98559654dfcc42bf1c75bffbe81728e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update dependencies with security fixes: undici, zod 4, the MCP TypeScript SDK, re2js, body-parser, qs, fast-uri, systeminformation and postcss-selector-parser.
- Updated dependencies [[`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`5865e00`](https://github.com/phaseoteam/Phaseo/commit/5865e001bf6beba88b95016614c293a27f27ba58), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2), [`4d14671`](https://github.com/phaseoteam/Phaseo/commit/4d1467182e68d4b4a4a96fa21323004ebdb9fcb2)]:
  - @phaseo/agent-sdk@0.4.0
