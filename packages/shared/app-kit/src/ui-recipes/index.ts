/**
 * Class recipes: plain Tailwind class strings that read the same on the website (Tailwind 4) and in the
 * mobile app (Uniwind). Only classes both understand go here: no `has-*`, no arbitrary selectors such as
 * `[&_svg]`, no `color-mix`. React Native text doesn't inherit colour from its container, so recipes keep
 * surface and text classes apart.
 *
 * Tailwind only generates classes it finds in the files it scans, and this package is outside the apps,
 * so each app lists the recipe files it uses with `@source` in its CSS (one file per recipe, so an
 * app only gets the classes it needs).
 */

export * from "./badge";
export * from "./callout";
export * from "./text";
