# @phaseo/app-kit

## 0.1.1

### Patch Changes

- [#3722](https://github.com/phaseoteam/Phaseo/pull/3722) [`0aff3f0`](https://github.com/phaseoteam/Phaseo/commit/0aff3f0278604d71c5e3239c8de54964816eda36) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable native inline and display math in mobile chat using the existing Markdown engine, with themed equations, model formatting guidance and intact streaming equation blocks. Share web/mobile currency and code normalization, including unfinished code fences.
  
  Compile Android SQLite from source to match the app's Expo Modules runtime after the native startup check exposed an incompatible prebuilt binary.
  
  Preserve Android's reflected display-math view during release shrinking and use Markdown escapes for currency because the native parser drops HTML entity text.

- [#3617](https://github.com/phaseoteam/Phaseo/pull/3617) [`7966526`](https://github.com/phaseoteam/Phaseo/commit/79665264b8e4394cf927415ee016d4a5999d6ed7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add opt-in app usage and sanitized JavaScript error tracking to desktop and mobile, disabled by default with persisted daily collection limits and immediate opt-out. Preserve saved preferences across updates and explain that installation IDs link events across sessions.

- [#3685](https://github.com/phaseoteam/Phaseo/pull/3685) [`5cfbd1a`](https://github.com/phaseoteam/Phaseo/commit/5cfbd1a06518bd1505a72b305c9d996d50f50c40) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve private error diagnostics with safe cause codes and stack locations, release context, native screen categories and bounded cause chains. Add credential-gated private web source-map uploads to production CI.
